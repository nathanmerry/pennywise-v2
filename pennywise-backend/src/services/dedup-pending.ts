import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { amountTolerance } from "./sync.js";

const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface DedupPendingResult {
  scanned: number;
  merged: number;
  skippedNoMatch: number;
  skippedAmbiguous: number;
  dryRun: boolean;
  merges: Array<{
    pendingId: string;
    postedId: string;
    merchant: string | null;
    pendingAmount: number;
    postedAmount: number;
    preservedDate: Date;
  }>;
}

export async function dedupPending(dryRun: boolean): Promise<DedupPendingResult> {
  const pendingRows = await prisma.transaction.findMany({
    where: { pending: true, normalizedMerchant: { not: null } },
  });

  const result: DedupPendingResult = {
    scanned: pendingRows.length,
    merged: 0,
    skippedNoMatch: 0,
    skippedAmbiguous: 0,
    dryRun,
    merges: [],
  };

  for (const pending of pendingRows) {
    const pendingAmount = Number(pending.amount);
    const tolerance = amountTolerance(pendingAmount);

    const candidates = await prisma.transaction.findMany({
      where: {
        id: { not: pending.id },
        accountId: pending.accountId,
        pending: false,
        normalizedMerchant: pending.normalizedMerchant,
        amount: {
          gte: pendingAmount - tolerance,
          lte: pendingAmount + tolerance,
        },
        transactionDate: {
          gte: new Date(pending.transactionDate.getTime() - MATCH_WINDOW_MS),
          lte: new Date(pending.transactionDate.getTime() + MATCH_WINDOW_MS),
        },
      },
      include: { categories: true },
    });

    if (candidates.length === 0) {
      result.skippedNoMatch++;
      continue;
    }

    // Pick closest on amount, tiebreak on closest date
    const posted = candidates.reduce((a, b) => {
      const da = Math.abs(Number(a.amount) - pendingAmount);
      const db = Math.abs(Number(b.amount) - pendingAmount);
      if (da !== db) return da < db ? a : b;
      const ta = Math.abs(a.transactionDate.getTime() - pending.transactionDate.getTime());
      const tb = Math.abs(b.transactionDate.getTime() - pending.transactionDate.getTime());
      return ta <= tb ? a : b;
    });

    // If more than one candidate has the exact same closeness as the winner, flag ambiguous
    const tied = candidates.filter((c) => {
      const dc = Math.abs(Number(c.amount) - pendingAmount);
      const dw = Math.abs(Number(posted.amount) - pendingAmount);
      const tc = Math.abs(c.transactionDate.getTime() - pending.transactionDate.getTime());
      const tw = Math.abs(posted.transactionDate.getTime() - pending.transactionDate.getTime());
      return dc === dw && tc === tw && c.id !== posted.id;
    });
    if (tied.length > 0) {
      result.skippedAmbiguous++;
      logger.warn(
        { pendingId: pending.id, candidateIds: candidates.map((c) => c.id) },
        "Skipping ambiguous pending match"
      );
      continue;
    }

    const postedWithCategories = posted as typeof posted & {
      categories: Array<{ id: string; categoryId: string; source: string; sourceRuleId: string | null }>;
    };

    const postedAmount = Number(posted.amount);

    result.merges.push({
      pendingId: pending.id,
      postedId: posted.id,
      merchant: pending.normalizedMerchant,
      pendingAmount,
      postedAmount,
      preservedDate: pending.transactionDate,
    });

    if (dryRun) {
      result.merged++;
      continue;
    }

    const pendingCategoryCount = await prisma.transactionCategory.count({
      where: { transactionId: pending.id },
    });

    await prisma.$transaction(async (tx) => {
      // If the pending has no categories but the posted does, move them over.
      // Posted's categories will cascade-delete with the posted row — move first.
      if (pendingCategoryCount === 0 && postedWithCategories.categories.length > 0) {
        await tx.transactionCategory.updateMany({
          where: { transactionId: posted.id },
          data: { transactionId: pending.id },
        });
      }

      // Delete posted row (cascades any remaining categories on posted).
      await tx.transaction.delete({ where: { id: posted.id } });

      // Promote the pending row: take posted's identity + finalised fields,
      // fold in user-edited fields only if pending lacked them.
      await tx.transaction.update({
        where: { id: pending.id },
        data: {
          source: posted.source,
          sourceTransactionId: posted.sourceTransactionId,
          amount: posted.amount,
          currency: posted.currency,
          description: posted.description,
          merchantName: posted.merchantName,
          normalizedMerchant: posted.normalizedMerchant,
          pending: false,
          rawJson: posted.rawJson === null ? undefined : (posted.rawJson as object),
          note: pending.note ?? posted.note,
          isIgnored: pending.isIgnored || posted.isIgnored,
          ignoreSource: pending.isIgnored ? pending.ignoreSource : posted.ignoreSource,
          categoriesLockedByUser:
            pending.categoriesLockedByUser || posted.categoriesLockedByUser,
          // transactionDate preserved
        },
      });
    });

    result.merged++;
  }

  return result;
}

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import * as truelayer from "./truelayer.js";
import { applyRulesToTransaction } from "./rules.js";
import { normalizeMerchant } from "./normalize.js";
import {format} from 'date-fns'

export async function syncConnection(connectionId: string) {
  const connection = await prisma.bankConnection.findUniqueOrThrow({
    where: { id: connectionId },
    include: { accounts: true },
  });

  if (connection.status !== "active") {
    logger.warn({ connectionId }, "Skipping sync for non-active connection");
    return { synced: 0, connectionId, status: connection.status };
  }

  let accessToken = connection.accessToken;

  // Try refreshing the token
  try {
    const tokens = await truelayer.refreshAccessToken(connection.refreshToken);
    accessToken = tokens.access_token;
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      },
    });
  } catch (err) {
    logger.error({ connectionId, err }, "Token refresh failed, marking as requires_reconnect");
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: "requires_reconnect" },
    });
    return { synced: 0, connectionId, status: "requires_reconnect" };
  }

  // Fetch accounts from provider and upsert
  const providerAccounts = await truelayer.fetchAccounts(accessToken);
  for (const pa of providerAccounts) {
    await prisma.account.upsert({
      where: {
        connectionId_providerAccountId: {
          connectionId: connection.id,
          providerAccountId: pa.account_id,
        },
      },
      create: {
        connectionId: connection.id,
        providerAccountId: pa.account_id,
        accountName: pa.display_name,
        accountType: pa.account_type,
        currency: pa.currency,
      },
      update: {
        accountName: pa.display_name,
        accountType: pa.account_type,
        currency: pa.currency,
      },
    });
  }

  // Reload accounts after upsert
  const accounts = await prisma.account.findMany({
    where: { connectionId: connection.id },
  });

  let totalSynced = 0;

  for (const account of accounts) {
    const synced = await syncAccount(accessToken, account.id, account.providerAccountId, connection.lastSyncedAt);
    totalSynced += synced;
  }

  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: { lastSyncedAt: new Date() },
  });

  return { synced: totalSynced, connectionId, status: "active" };
}

async function syncAccount(
  accessToken: string,
  accountId: string,
  providerAccountId: string,
  lastSyncedAt: Date | null
): Promise<number> {
  const now = new Date();
  const toStr = now.toISOString().split("T")[0];

  // Try progressively shorter windows if we hit SCA errors
  const fallbackDays = [730, 365, 180, 90];
  const overlapMs = 30 * 24 * 60 * 60 * 1000;

  let fromStr: string;
  if (lastSyncedAt) {
    fromStr = new Date(lastSyncedAt.getTime() - overlapMs).toISOString().split("T")[0];
  } else {
    fromStr = new Date(now.getTime() - fallbackDays[0] * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  }

  let posted: Awaited<ReturnType<typeof truelayer.fetchTransactions>> = [];
  let fetched = false;

  // For initial syncs, try progressively shorter windows on SCA errors
  if (!lastSyncedAt) {
    for (const days of fallbackDays) {
      fromStr = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      logger.info({ accountId, providerAccountId, from: fromStr, to: toStr, days }, "Fetching transactions");
      try {
        posted = await truelayer.fetchTransactions(accessToken, providerAccountId, fromStr, toStr);
        fetched = true;
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("sca_exceeded") || msg.includes("403")) {
          logger.warn({ accountId, days }, "SCA error, trying shorter window");
          continue;
        }
        throw err;
      }
    }
    if (!fetched) {
      logger.error({ accountId }, "All fetch windows failed due to SCA restrictions");
      return 0;
    }
  } else {
    logger.info({ accountId, providerAccountId, from: fromStr, to: toStr }, "Fetching transactions");
    posted = await truelayer.fetchTransactions(accessToken, providerAccountId, fromStr, toStr);
  }

  const pending = await truelayer.fetchPendingTransactions(accessToken, providerAccountId);

  let synced = 0;

  // console.dir(pending.find((p) => p.description.includes("Wagtail")), { depth: null });
  const filteredPosted = posted.filter(t => {
    try {
      // console.log(t)
      const date = format(new Date(t.timestamp), 'yyyy-MM-dd');
      console.log(date);
      return date === '2026-04-07'
    } catch (err) {
      logger.error({ err }, "Failed to format date");
    }
  })

  console.dir([{}], { depth: null });
  console.dir(filteredPosted, { depth: null });

  // Process posted transactions
  for (const tx of posted) {
    await upsertTransaction(accountId, tx, false);
    synced++;
  }

  // Process pending transactions
  for (const tx of pending) {
    await upsertTransaction(accountId, tx, true);
    synced++;
  }

  return synced;
}

async function upsertTransaction(
  accountId: string,
  tx: {
    transaction_id: string;
    timestamp: string;
    description: string;
    amount: number;
    currency: string;
    meta?: { provider_merchant_name?: string; [key: string]: unknown };
    status?: string;
  },
  isPending: boolean
) {
  const source = "truelayer";
  const sourceTransactionId = tx.transaction_id;
  const merchantName = tx.meta?.provider_merchant_name || null;
  const normalizedMerchant = normalizeMerchant(merchantName, tx.description) || null;
  const transactionDate = new Date(tx.timestamp);

  // Check if transaction already exists by source ID
  const existing = await prisma.transaction.findUnique({
    where: { source_sourceTransactionId: { source, sourceTransactionId } },
  });

  if (existing) {
    // Update provider data but respect manual overrides
    const updateData: Record<string, unknown> = {
      amount: tx.amount,
      currency: tx.currency,
      transactionDate,
      description: tx.description,
      merchantName,
      normalizedMerchant,
      pending: isPending,
      rawJson: tx as object,
    };

    await prisma.transaction.update({
      where: { id: existing.id },
      data: updateData,
    });
    return;
  }

  // If this is a posted transaction, check for pending duplicate
  // (pending transactions have more accurate dates, so we skip creating the posted version)
  if (!isPending) {
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const potentialDuplicate = await prisma.transaction.findFirst({
      where: {
        accountId,
        pending: true,
        amount: tx.amount,
        normalizedMerchant,
        transactionDate: {
          gte: new Date(transactionDate.getTime() - threeDaysMs),
          lte: new Date(transactionDate.getTime() + threeDaysMs),
        },
      },
    });

    if (potentialDuplicate) {
      logger.info(
        {
          pendingId: potentialDuplicate.id,
          pendingDate: potentialDuplicate.transactionDate,
          postedDate: transactionDate,
          merchant: normalizedMerchant,
          amount: tx.amount,
        },
        "Skipping posted transaction - pending duplicate exists with more accurate date"
      );
      return;
    }
  }

  // Create new transaction
  const created = await prisma.transaction.create({
    data: {
      source,
      sourceTransactionId,
      accountId,
      amount: tx.amount,
      currency: tx.currency,
      transactionDate,
      description: tx.description,
      merchantName,
      normalizedMerchant,
      pending: isPending,
      rawJson: tx as object,
    },
  });

  // Apply recurring rules to new transactions only
  await applyRulesToTransaction(created.id);
}

export async function syncAllConnections() {
  const connections = await prisma.bankConnection.findMany({
    where: { status: "active" },
  });

  const results: Array<{ synced: number; connectionId: string; status: string }> = [];
  for (const conn of connections) {
    try {
      const result = await syncConnection(conn.id);
      results.push(result);
    } catch (err) {
      logger.error({ connectionId: conn.id, err }, "Sync failed for connection");
      results.push({ synced: 0, connectionId: conn.id, status: "error" });
    }
  }

  return results;
}

/**
 * One-time backfill script to populate normalized_merchant for all existing transactions.
 * Run with: npx tsx src/scripts/backfill-normalized-merchant.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { normalizeMerchant } from "../services/normalize.js";

async function main() {
  const transactions = await prisma.transaction.findMany({
    select: { id: true, merchantName: true, description: true },
  });

  console.log(`Backfilling ${transactions.length} transactions...`);

  let updated = 0;
  const batchSize = 100;

  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (tx) => {
        const normalized = normalizeMerchant(tx.merchantName, tx.description) || null;
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { normalizedMerchant: normalized },
        });
      })
    );
    updated += batch.length;
    if (updated % 500 === 0 || updated === transactions.length) {
      console.log(`  ${updated}/${transactions.length} done`);
    }
  }

  console.log("Backfill complete.");

  // Print a sample of the normalization results for verification
  const samples = await prisma.transaction.findMany({
    select: { merchantName: true, description: true, normalizedMerchant: true },
    take: 50,
    orderBy: { transactionDate: "desc" },
  });

  console.log("\nSample results (50 most recent):");
  console.log("─".repeat(90));
  for (const s of samples) {
    const raw = s.merchantName || s.description || "(empty)";
    console.log(`  ${raw.padEnd(40)} → ${s.normalizedMerchant || "(empty)"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

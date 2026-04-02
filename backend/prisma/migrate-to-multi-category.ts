/**
 * Data migration: single-category → multi-category
 *
 * Run BEFORE dropping the old columns (categoryId, categorySource on transactions;
 * categoryId on recurring_rules).
 *
 * Steps:
 * 1. For each transaction with a categoryId, create a TransactionCategory row
 *    with source derived from the old categorySource field.
 * 2. For each recurring rule with a categoryId, create a RecurringRuleCategory row.
 *
 * Usage:
 *   npx tsx prisma/migrate-to-multi-category.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting multi-category migration...\n");

  // Step 1: Migrate transaction categories
  // We need raw SQL because the old columns are gone from the Prisma schema
  const transactions: { id: string; category_id: string; category_source: string | null }[] =
    await prisma.$queryRawUnsafe(
      `SELECT id, category_id, category_source FROM transactions WHERE category_id IS NOT NULL`
    );

  console.log(`Found ${transactions.length} transactions with categories to migrate.`);

  let txCreated = 0;
  let txSkipped = 0;

  for (const tx of transactions) {
    try {
      await prisma.transactionCategory.create({
        data: {
          transactionId: tx.id,
          categoryId: tx.category_id,
          source: tx.category_source || "rule",
        },
      });
      txCreated++;
    } catch (err: unknown) {
      // Skip duplicates (unique constraint on [transactionId, categoryId])
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique constraint")) {
        txSkipped++;
      } else {
        throw err;
      }
    }
  }

  console.log(`  Created: ${txCreated}, Skipped (duplicate): ${txSkipped}\n`);

  // Step 1b: Lock transactions that had manual category assignments
  const manualTxIds = transactions
    .filter((tx) => tx.category_source === "manual")
    .map((tx) => tx.id);

  if (manualTxIds.length > 0) {
    const lockResult = await prisma.transaction.updateMany({
      where: { id: { in: manualTxIds } },
      data: { categoriesLockedByUser: true },
    });
    console.log(`  Locked ${lockResult.count} transactions with manual category source.\n`);
  }

  // Step 2: Migrate recurring rule categories
  const rules: { id: string; category_id: string }[] = await prisma.$queryRawUnsafe(
    `SELECT id, category_id FROM recurring_rules WHERE category_id IS NOT NULL`
  );

  console.log(`Found ${rules.length} rules with categories to migrate.`);

  let ruleCreated = 0;
  let ruleSkipped = 0;

  for (const rule of rules) {
    try {
      await prisma.recurringRuleCategory.create({
        data: {
          ruleId: rule.id,
          categoryId: rule.category_id,
        },
      });
      ruleCreated++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique constraint")) {
        ruleSkipped++;
      } else {
        throw err;
      }
    }
  }

  console.log(`  Created: ${ruleCreated}, Skipped (duplicate): ${ruleSkipped}\n`);
  console.log("Migration complete!");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

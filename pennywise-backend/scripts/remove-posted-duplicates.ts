import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

async function removePostedDuplicates() {
  console.log("Finding duplicate posted transactions (keeping pending ones)...\n");

  // Get all pending transactions
  const pendingTxs = await prisma.transaction.findMany({
    where: { pending: true },
    orderBy: { transactionDate: "desc" },
  });

  console.log(`Found ${pendingTxs.length} pending transactions to check`);

  let duplicatesFound = 0;
  const idsToDelete: string[] = [];

  for (const pending of pendingTxs) {
    // Look for posted transactions with same merchant, amount, and date within 3 days
    const matchingPosted = await prisma.transaction.findMany({
      where: {
        pending: false,
        amount: pending.amount,
        normalizedMerchant: pending.normalizedMerchant,
        transactionDate: {
          gte: new Date(pending.transactionDate.getTime() - 3 * 24 * 60 * 60 * 1000),
          lte: new Date(pending.transactionDate.getTime() + 3 * 24 * 60 * 60 * 1000),
        },
      },
    });

    if (matchingPosted.length > 0) {
      duplicatesFound += matchingPosted.length;
      console.log(`\nDuplicate found:`);
      console.log(`  Keeping (pending): ${pending.description} | ${pending.amount} | ${pending.transactionDate.toISOString().split('T')[0]}`);
      
      for (const posted of matchingPosted) {
        console.log(`  Deleting (posted): ${posted.description} | ${posted.amount} | ${posted.transactionDate.toISOString().split('T')[0]} | ID: ${posted.id}`);
        idsToDelete.push(posted.id);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Found ${duplicatesFound} posted duplicates to delete`);
  console.log(`${"=".repeat(60)}\n`);

  if (idsToDelete.length > 0) {
    console.log("Deleting duplicate posted transactions...");
    
    // Delete transaction categories first (due to foreign key constraints)
    await prisma.transactionCategory.deleteMany({
      where: {
        transactionId: { in: idsToDelete },
      },
    });

    // Delete the transactions
    const result = await prisma.transaction.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    console.log(`✓ Deleted ${result.count} posted duplicate transactions`);
  } else {
    console.log("No duplicates to delete");
  }

  console.log("\nCleanup complete!");
}

removePostedDuplicates()
  .then(() => {
    console.log("\nScript finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

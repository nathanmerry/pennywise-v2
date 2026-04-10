import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { subMonths } from "date-fns";

async function cleanupOldCategories() {
  try {
    console.log("Starting category cleanup...");

    // Calculate the cutoff date (4 months ago from now)
    const cutoffDate = subMonths(new Date(), 4);
    console.log(`Cutoff date: ${cutoffDate.toISOString()}`);

    // Find all transactions older than 4 months that have categories
    const oldTransactionsWithCategories = await prisma.transaction.findMany({
      where: {
        transactionDate: {
          lt: cutoffDate,
        },
        categories: {
          some: {},
        },
      },
      select: {
        id: true,
        transactionDate: true,
        description: true,
        categories: {
          select: {
            id: true,
            categoryId: true,
          },
        },
      },
    });

    console.log(
      `Found ${oldTransactionsWithCategories.length} transactions older than 4 months with categories`
    );

    // Remove categories from these transactions
    let removedCategoryLinks = 0;
    for (const transaction of oldTransactionsWithCategories) {
      const categoryLinkIds = transaction.categories.map((c) => c.id);
      if (categoryLinkIds.length > 0) {
        await prisma.transactionCategory.deleteMany({
          where: {
            id: {
              in: categoryLinkIds,
            },
          },
        });
        removedCategoryLinks += categoryLinkIds.length;
      }
    }

    console.log(`Removed ${removedCategoryLinks} category links from old transactions`);

    // Find categories that now have no transactions
    const allCategories = await prisma.category.findMany({
      include: {
        transactionCategories: true,
        ruleCategories: true,
        budgetGroupMappings: true,
        fixedCommitments: true,
        plannedSpends: true,
        categoryPlans: true,
      },
    });

    const categoriesToDelete = allCategories.filter(
      (category) =>
        category.transactionCategories.length === 0 &&
        category.ruleCategories.length === 0 &&
        category.budgetGroupMappings.length === 0 &&
        category.fixedCommitments.length === 0 &&
        category.plannedSpends.length === 0 &&
        category.categoryPlans.length === 0
    );

    console.log(`Found ${categoriesToDelete.length} unused categories to delete`);

    // Delete unused categories
    if (categoriesToDelete.length > 0) {
      const categoryIds = categoriesToDelete.map((c) => c.id);
      
      // First, update any child categories to have no parent
      await prisma.category.updateMany({
        where: {
          parentId: {
            in: categoryIds,
          },
        },
        data: {
          parentId: null,
        },
      });

      // Then delete the categories
      const deleteResult = await prisma.category.deleteMany({
        where: {
          id: {
            in: categoryIds,
          },
        },
      });

      console.log(`Deleted ${deleteResult.count} unused categories:`);
      categoriesToDelete.forEach((cat) => {
        console.log(`  - ${cat.name} (ID: ${cat.id})`);
      });
    }

    console.log("\nCleanup complete!");
    console.log(`Summary:`);
    console.log(`  - Removed ${removedCategoryLinks} category links from transactions older than 4 months`);
    console.log(`  - Deleted ${categoriesToDelete.length} unused categories`);
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupOldCategories()
  .then(() => {
    console.log("\nScript finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });

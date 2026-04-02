import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export async function applyRulesToTransaction(transactionId: string) {
  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
  });

  // Don't overwrite manual assignments
  const canUpdateCategory = transaction.categorySource !== "manual";
  const canUpdateIgnore = transaction.ignoreSource !== "manual";

  if (!canUpdateCategory && !canUpdateIgnore) return;

  const rules = await prisma.recurringRule.findMany({
    where: { active: true },
  });

  for (const rule of rules) {
    const fieldToMatch =
      rule.matchType === "merchant"
        ? transaction.merchantName
        : transaction.description;

    if (!fieldToMatch) continue;

    // Case-insensitive partial match
    if (!fieldToMatch.toLowerCase().includes(rule.matchValue.toLowerCase())) continue;

    logger.info(
      { transactionId, ruleId: rule.id, matchType: rule.matchType, matchValue: rule.matchValue },
      "Recurring rule matched"
    );

    const updateData: Record<string, unknown> = {};

    if (rule.categoryId && canUpdateCategory) {
      updateData.categoryId = rule.categoryId;
      updateData.categorySource = "rule";
    }

    if (rule.setIgnored !== null && canUpdateIgnore) {
      updateData.isIgnored = rule.setIgnored;
      updateData.ignoreSource = "rule";
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: updateData,
      });
    }

    // First matching rule wins
    break;
  }
}

export async function applyRuleToExistingTransactions(ruleId: string) {
  const rule = await prisma.recurringRule.findUniqueOrThrow({
    where: { id: ruleId },
  });

  if (!rule.active) return 0;

  // Find all matching transactions
  const field = rule.matchType === "merchant" ? "merchantName" : "description";

  const transactions = await prisma.transaction.findMany({
    where: {
      [field]: { contains: rule.matchValue, mode: "insensitive" },
    },
  });

  let updated = 0;

  for (const tx of transactions) {
    const canUpdateCategory = tx.categorySource !== "manual";
    const canUpdateIgnore = tx.ignoreSource !== "manual";

    const updateData: Record<string, unknown> = {};

    if (rule.categoryId && canUpdateCategory) {
      updateData.categoryId = rule.categoryId;
      updateData.categorySource = "rule";
    }

    if (rule.setIgnored !== null && canUpdateIgnore) {
      updateData.isIgnored = rule.setIgnored;
      updateData.ignoreSource = "rule";
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: updateData,
      });
      updated++;
    }
  }

  return updated;
}

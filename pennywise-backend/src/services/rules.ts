import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/**
 * Given a list of category IDs, expand them to include all ancestor categories.
 * Returns an array of { categoryId, source } where direct IDs keep the given source
 * and ancestors are marked as "inherited".
 */
export async function expandCategoryIds(
  categoryIds: string[],
  source: "rule" | "manual",
  sourceRuleId?: string | null
): Promise<{ categoryId: string; source: string; sourceRuleId: string | null }[]> {
  if (categoryIds.length === 0) return [];

  // Fetch all categories we might need in one go
  const allCategories = await prisma.category.findMany({
    select: { id: true, parentId: true },
  });
  const catMap = new Map(allCategories.map((c) => [c.id, c]));

  const result = new Map<string, { categoryId: string; source: string; sourceRuleId: string | null }>();

  for (const id of categoryIds) {
    // Add the direct category
    if (!result.has(id)) {
      result.set(id, { categoryId: id, source, sourceRuleId: sourceRuleId ?? null });
    }

    // Walk up the ancestry chain
    let current = catMap.get(id);
    while (current?.parentId) {
      const parentId = current.parentId;
      if (!result.has(parentId)) {
        result.set(parentId, { categoryId: parentId, source: "inherited", sourceRuleId: sourceRuleId ?? null });
      }
      current = catMap.get(parentId);
    }
  }

  return Array.from(result.values());
}

/**
 * Set categories on a transaction. Replaces all existing category assignments.
 */
export async function setTransactionCategories(
  transactionId: string,
  expanded: { categoryId: string; source: string; sourceRuleId: string | null }[]
) {
  // Delete existing
  await prisma.transactionCategory.deleteMany({ where: { transactionId } });

  // Insert new (skip if empty — uncategorise)
  if (expanded.length > 0) {
    await prisma.transactionCategory.createMany({
      data: expanded.map((e) => ({
        transactionId,
        categoryId: e.categoryId,
        source: e.source,
        sourceRuleId: e.sourceRuleId,
      })),
      skipDuplicates: true,
    });
  }
}

export async function applyRulesToTransaction(transactionId: string) {
  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
  });

  // Don't overwrite manual assignments
  const canUpdateCategory = !transaction.categoriesLockedByUser;
  const canUpdateIgnore = transaction.ignoreSource !== "manual";

  if (!canUpdateCategory && !canUpdateIgnore) return;

  const rules = await prisma.recurringRule.findMany({
    where: { active: true },
    include: { categories: true },
  });

  for (const rule of rules) {
    // For merchant rules, prefer normalizedMerchant (collapses variants),
    // fall back to raw merchantName. Description rules use raw description.
    const fieldsToMatch =
      rule.matchType === "merchant"
        ? [transaction.normalizedMerchant, transaction.merchantName]
        : [transaction.description];

    const matchValueLower = rule.matchValue.toLowerCase();
    const matched = fieldsToMatch.some(
      (f) => f && f.toLowerCase().includes(matchValueLower)
    );
    if (!matched) continue;

    logger.info(
      { transactionId, ruleId: rule.id, matchType: rule.matchType, matchValue: rule.matchValue },
      "Recurring rule matched"
    );

    // Apply categories from rule
    if (rule.categories.length > 0 && canUpdateCategory) {
      const categoryIds = rule.categories.map((rc) => rc.categoryId);
      const expanded = await expandCategoryIds(categoryIds, "rule", rule.id);
      await setTransactionCategories(transactionId, expanded);
    }

    // Apply ignore
    if (rule.setIgnored !== null && canUpdateIgnore) {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          isIgnored: rule.setIgnored,
          ignoreSource: "rule",
        },
      });
    }

    // First matching rule wins
    break;
  }
}

export async function applyRuleToExistingTransactions(ruleId: string) {
  const rule = await prisma.recurringRule.findUniqueOrThrow({
    where: { id: ruleId },
    include: { categories: true },
  });

  if (!rule.active) return 0;

  // Find all matching transactions
  // For merchant rules, match against both normalizedMerchant and raw merchantName
  // to catch all variants. For description rules, use raw description.
  const transactions = await prisma.transaction.findMany({
    where: rule.matchType === "merchant"
      ? {
          OR: [
            { normalizedMerchant: { contains: rule.matchValue, mode: "insensitive" } },
            { merchantName: { contains: rule.matchValue, mode: "insensitive" } },
          ],
        }
      : {
          description: { contains: rule.matchValue, mode: "insensitive" },
        },
  });

  let updated = 0;
  const categoryIds = rule.categories.map((rc) => rc.categoryId);
  const expanded = categoryIds.length > 0 ? await expandCategoryIds(categoryIds, "rule", rule.id) : [];

  for (const tx of transactions) {
    const canUpdateCategory = !tx.categoriesLockedByUser;
    const canUpdateIgnore = tx.ignoreSource !== "manual";

    let didUpdate = false;

    if (expanded.length > 0 && canUpdateCategory) {
      await setTransactionCategories(tx.id, expanded);
      didUpdate = true;
    }

    if (rule.setIgnored !== null && canUpdateIgnore) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          isIgnored: rule.setIgnored,
          ignoreSource: "rule",
        },
      });
      didUpdate = true;
    }

    if (didUpdate) updated++;
  }

  return updated;
}

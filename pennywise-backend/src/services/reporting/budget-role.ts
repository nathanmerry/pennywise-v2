import { prisma } from "../../lib/prisma.js";
import { getRootCategoryId, type CategoryWithAncestry } from "./category-attribution.js";

export interface FixedCategoryEntry {
  plannedAmount: number;
}

export type CategoryBudgetRole = "fixed" | "flexible";

function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

/**
 * Root-keyed map of categories whose spend was pre-allocated at planning time
 * (fixed commitments + planned one-offs), with the summed planned amount.
 * Used by Spending Analysis to tag a category row as "fixed" so it groups
 * with commitments rather than flexible spend — matches the pace/overview
 * fixed-vs-flexible split (see getCategoryBudgetRoleMap).
 */
export async function getFixedCategoryMap(
  month: string,
  ancestryMap: Map<string, CategoryWithAncestry>,
): Promise<Map<string, FixedCategoryEntry>> {
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: { fixedCommitments: true, plannedSpends: true },
  });

  const rootFixed = new Map<string, FixedCategoryEntry>();
  if (!budgetMonth) return rootFixed;

  const accumulate = (categoryId: string | null, amount: unknown) => {
    if (!categoryId) return;
    const rootCategoryId = getRootCategoryId(categoryId, ancestryMap);
    const existing = rootFixed.get(rootCategoryId) ?? { plannedAmount: 0 };
    existing.plannedAmount += toNumber(amount);
    rootFixed.set(rootCategoryId, existing);
  };

  for (const commitment of budgetMonth.fixedCommitments) {
    accumulate(commitment.categoryId, commitment.amount);
  }
  for (const planned of budgetMonth.plannedSpends) {
    accumulate(planned.categoryId, planned.amount);
  }

  return rootFixed;
}

/**
 * Per-category role map: every category in the tree labelled "fixed" or
 * "flexible". A category is "fixed" if it (or any ancestor) is linked to a
 * fixed commitment or a planned one-off — i.e. its spend was reserved at
 * planning time and shouldn't inflate the flexible/pace tally.
 *
 * Source: BudgetMonth.fixedCommitments + BudgetMonth.plannedSpends, expanded
 * to descendants. Used by Overview/pace to split spend between fixed and
 * flexible.
 */
export async function getCategoryBudgetRoleMap(
  month: string,
  ancestryMap: Map<string, CategoryWithAncestry>,
): Promise<Map<string, CategoryBudgetRole>> {
  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month },
    include: { fixedCommitments: true, plannedSpends: true },
  });

  const roleMap = new Map<string, CategoryBudgetRole>();
  for (const [categoryId] of ancestryMap) {
    roleMap.set(categoryId, "flexible");
  }

  if (!budgetMonth) return roleMap;

  const seeds = new Set<string>();
  for (const commitment of budgetMonth.fixedCommitments) {
    if (commitment.categoryId) seeds.add(commitment.categoryId);
  }
  for (const planned of budgetMonth.plannedSpends) {
    if (planned.categoryId) seeds.add(planned.categoryId);
  }

  if (seeds.size === 0) return roleMap;

  const childrenMap = new Map<string, string[]>();
  for (const [id, node] of ancestryMap) {
    if (node.parentId) {
      const kids = childrenMap.get(node.parentId) ?? [];
      kids.push(id);
      childrenMap.set(node.parentId, kids);
    }
  }

  const markFixed = (id: string) => {
    if (roleMap.get(id) === "fixed") return;
    roleMap.set(id, "fixed");
    for (const kid of childrenMap.get(id) ?? []) markFixed(kid);
  };
  for (const seed of seeds) markFixed(seed);

  return roleMap;
}

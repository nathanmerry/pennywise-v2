import { prisma } from "../../lib/prisma.js";
import { effectiveAmount } from "../../lib/effective-amount.js";
import {
  buildCategoryAncestryMap,
  buildDescendantSet,
  getRootCategoryId,
  resolveMultiCategoryTransaction,
  type CategoryWithAncestry,
} from "./category-attribution.js";

/**
 * Every non-ignored outflow in the range. Includes uncategorised transactions
 * and ones tagged with multiple unrelated categories — callers that need a
 * total spend figure (pace, daily/merchant rollups) must use this so
 * uncategorised txs don't silently disappear from the headline numbers.
 *
 * `categoryIds` is every direct (non-inherited) category assigned to the tx.
 * Use it for "is any of these fixed?"-style checks.
 */
export interface ReportableOutflow {
  id: string;
  transactionDate: Date;
  transactionDateKey: string;
  amount: number;
  description: string;
  merchantName: string | null;
  normalizedMerchant: string | null;
  merchantKey: string;
  categoryIds: string[];
}

/**
 * An outflow whose category assignments resolve to a single safe lineage.
 * Use this for category-bucket reporting (Spending Analysis category rows,
 * byParentCategory, per-category pace) where attributing to a specific
 * bucket is required.
 *
 * WARNING: this view DROPS uncategorised transactions and any transaction
 * whose categories don't resolve to a single lineage. Never use the
 * corresponding fetcher for headline spend totals — use getReportableOutflows
 * for that.
 */
export interface CategoryResolvedOutflow extends ReportableOutflow {
  categoryId: string;
  rootCategoryId: string;
  rootCategoryName: string;
}

export interface CategoryResolvedOutflowFilters {
  startDate: Date;
  endDate: Date;
  accountId?: string;
  /** When set, only include transactions whose category is this category or a descendant. */
  categoryId?: string;
  includeIgnored?: boolean;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface RawOutflow {
  id: string;
  transactionDate: Date;
  amount: unknown;
  updatedTransactionAmount: unknown;
  description: string;
  merchantName: string | null;
  normalizedMerchant: string | null;
  categories: { categoryId: string }[];
}

async function fetchRawOutflows(filters: CategoryResolvedOutflowFilters): Promise<RawOutflow[]> {
  return prisma.transaction.findMany({
    where: {
      transactionDate: { gte: filters.startDate, lte: filters.endDate },
      amount: { lt: 0 },
      ...(filters.includeIgnored ? {} : { isIgnored: false }),
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
    },
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      updatedTransactionAmount: true,
      description: true,
      merchantName: true,
      normalizedMerchant: true,
      categories: {
        where: { source: { not: "inherited" } },
        select: { categoryId: true },
      },
    },
    orderBy: { transactionDate: "asc" },
  });
}

function toBaseOutflow(tx: RawOutflow, categoryIds: string[]): ReportableOutflow {
  return {
    id: tx.id,
    transactionDate: tx.transactionDate,
    transactionDateKey: formatDateKey(tx.transactionDate),
    amount: Math.abs(effectiveAmount(tx)),
    description: tx.description,
    merchantName: tx.merchantName,
    normalizedMerchant: tx.normalizedMerchant,
    merchantKey:
      tx.normalizedMerchant ||
      tx.merchantName ||
      tx.description.slice(0, 80),
    categoryIds,
  };
}

export async function getReportableOutflows(
  filters: CategoryResolvedOutflowFilters,
  ancestryMapOverride?: Map<string, CategoryWithAncestry>,
): Promise<ReportableOutflow[]> {
  const raw = await fetchRawOutflows(filters);

  // Descendant filtering only needs the ancestry map; build it lazily.
  let descendantSet: Set<string> | null = null;
  if (filters.categoryId) {
    const ancestryMap = ancestryMapOverride ?? (await buildCategoryAncestryMap());
    descendantSet = buildDescendantSet(filters.categoryId, ancestryMap);
  }

  const outflows: ReportableOutflow[] = [];
  for (const tx of raw) {
    const categoryIds = tx.categories.map((c) => c.categoryId);
    if (descendantSet && !categoryIds.some((id) => descendantSet!.has(id))) {
      continue;
    }
    outflows.push(toBaseOutflow(tx, categoryIds));
  }
  return outflows;
}

export async function getCategoryResolvedOutflows(
  filters: CategoryResolvedOutflowFilters,
  ancestryMapOverride?: Map<string, CategoryWithAncestry>,
): Promise<CategoryResolvedOutflow[]> {
  const ancestryMap = ancestryMapOverride ?? (await buildCategoryAncestryMap());
  const raw = await fetchRawOutflows(filters);

  const descendantSet = filters.categoryId
    ? buildDescendantSet(filters.categoryId, ancestryMap)
    : null;

  const reportable: CategoryResolvedOutflow[] = [];
  for (const tx of raw) {
    const categoryIds = tx.categories.map((c) => c.categoryId);
    const resolvedCategoryId = resolveMultiCategoryTransaction(categoryIds, ancestryMap);
    if (!resolvedCategoryId) continue;
    if (descendantSet && !descendantSet.has(resolvedCategoryId)) continue;

    const rootCategoryId = getRootCategoryId(resolvedCategoryId, ancestryMap);
    const rootCategory = ancestryMap.get(rootCategoryId);

    reportable.push({
      ...toBaseOutflow(tx, categoryIds),
      categoryId: resolvedCategoryId,
      rootCategoryId,
      rootCategoryName:
        rootCategory?.name ?? ancestryMap.get(resolvedCategoryId)?.name ?? "Uncategorised",
    });
  }
  return reportable;
}

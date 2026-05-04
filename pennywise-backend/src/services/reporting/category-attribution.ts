import { prisma } from "../../lib/prisma.js";

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

export interface CategoryWithAncestry extends CategoryNode {
  depth: number;
}

export async function buildCategoryAncestryMap(): Promise<Map<string, CategoryWithAncestry>> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true },
  });

  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const ancestryMap = new Map<string, CategoryWithAncestry>();

  function getDepth(categoryId: string): number {
    let depth = 0;
    let current = categoryMap.get(categoryId);

    while (current?.parentId) {
      depth += 1;
      current = categoryMap.get(current.parentId);
    }

    return depth;
  }

  for (const category of categories) {
    ancestryMap.set(category.id, {
      ...category,
      depth: getDepth(category.id),
    });
  }

  return ancestryMap;
}

export function isDescendantOf(
  categoryId: string,
  potentialAncestorId: string,
  ancestryMap: Map<string, CategoryWithAncestry>
): boolean {
  let current = ancestryMap.get(categoryId);

  while (current?.parentId) {
    if (current.parentId === potentialAncestorId) {
      return true;
    }
    current = ancestryMap.get(current.parentId);
  }

  return false;
}

export function resolveMultiCategoryTransaction(
  directCategoryIds: string[],
  ancestryMap: Map<string, CategoryWithAncestry>
): string | null {
  const uniqueIds = [...new Set(directCategoryIds)];

  if (uniqueIds.length === 0) return null;
  if (uniqueIds.length === 1) return uniqueIds[0];

  const withDepth = uniqueIds
    .map((id) => ({ id, depth: ancestryMap.get(id)?.depth ?? 0 }))
    .sort((a, b) => b.depth - a.depth);

  const deepest = withDepth[0];

  // Only attribute to the deepest category if every other assigned category
  // sits on the same lineage (i.e. is an ancestor of deepest). If any sibling
  // or unrelated category is mixed in, the transaction is ambiguous and we
  // refuse to attribute — callers can still see the raw categoryIds.
  const allSameLineage = withDepth
    .slice(1)
    .every((other) => isDescendantOf(deepest.id, other.id, ancestryMap));

  return allSameLineage ? deepest.id : null;
}

export function getRootCategoryId(
  categoryId: string,
  ancestryMap: Map<string, CategoryWithAncestry>
): string {
  let current = ancestryMap.get(categoryId);

  while (current?.parentId) {
    current = ancestryMap.get(current.parentId);
  }

  return current?.id ?? categoryId;
}

export function buildDescendantSet(
  targetCategoryId: string,
  ancestryMap: Map<string, CategoryWithAncestry>
): Set<string> {
  const descendants = new Set<string>([targetCategoryId]);

  for (const [categoryId] of ancestryMap) {
    if (categoryId !== targetCategoryId && isDescendantOf(categoryId, targetCategoryId, ancestryMap)) {
      descendants.add(categoryId);
    }
  }

  return descendants;
}

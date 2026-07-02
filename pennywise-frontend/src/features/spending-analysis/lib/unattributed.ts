// Sentinel category ids the backend emits for transactions that don't resolve
// to a single safe category (uncategorised + ambiguous multi-category). They
// surface as synthetic rows in the breakdown and are drillable — the drilldown
// endpoint resolves them to the underlying transactions.
export const UNATTRIBUTED_FLEXIBLE_ID = "__unattributed_flexible__";
export const UNATTRIBUTED_FIXED_ID = "__unattributed_fixed__";

export function isUnattributedRow(categoryId: string): boolean {
  return (
    categoryId === UNATTRIBUTED_FLEXIBLE_ID ||
    categoryId === UNATTRIBUTED_FIXED_ID
  );
}

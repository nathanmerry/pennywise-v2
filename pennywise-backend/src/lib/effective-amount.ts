/**
 * Returns the user-edited amount when present, otherwise the bank-reported amount.
 *
 * Use this anywhere transaction amounts are *summed for budgeting/display*.
 * Don't use it for:
 *  - Bank sync reconciliation (provider data uses raw `amount`).
 *  - Pending → posted dedup matching (matches against the bank-reported value).
 */
export function effectiveAmount(tx: {
  amount: unknown;
  updatedTransactionAmount?: unknown;
}): number {
  const raw =
    tx.updatedTransactionAmount !== null && tx.updatedTransactionAmount !== undefined
      ? tx.updatedTransactionAmount
      : tx.amount;
  if (typeof raw === "number") return raw;
  if (typeof raw === "object" && raw !== null && "toNumber" in raw) {
    return (raw as { toNumber: () => number }).toNumber();
  }
  return Number(raw);
}

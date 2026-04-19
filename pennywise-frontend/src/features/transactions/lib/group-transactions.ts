import { format, isThisYear, isToday, isYesterday, parseISO } from "date-fns";
import type { Transaction } from "@/shared/lib/api";

export interface TransactionDayGroup {
  dateKey: string;
  label: string;
  total: number;
  currency: string;
  transactions: Transaction[];
}

export function groupTransactionsByDay(
  transactions: Transaction[],
): TransactionDayGroup[] {
  const map = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = tx.transactionDate.slice(0, 10);
    const existing = map.get(key);
    if (existing) existing.push(tx);
    else map.set(key, [tx]);
  }

  const groups: TransactionDayGroup[] = [];
  for (const [dateKey, txs] of map.entries()) {
    txs.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    const total = txs.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    groups.push({
      dateKey,
      label: formatDayLabel(dateKey),
      total,
      currency: txs[0]?.currency ?? "GBP",
      transactions: txs,
    });
  }

  groups.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  return groups;
}

export function formatDayLabel(dateKey: string): string {
  const d = parseISO(dateKey);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisYear(d)) return format(d, "d MMMM");
  return format(d, "d MMMM yyyy");
}

export function formatAmount(
  amount: number,
  currency: string = "GBP",
  options: { signDisplay?: "always" | "auto" } = {},
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    signDisplay: options.signDisplay ?? "always",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateRangeLabel(from?: string, to?: string): string {
  if (!from && !to) return "All time";
  const fromDate = from ? parseISO(from) : undefined;
  const toDate = to ? parseISO(to) : undefined;

  const fmt = (d: Date) =>
    isThisYear(d) ? format(d, "d MMM") : format(d, "d MMM yyyy");

  if (fromDate && toDate) {
    if (
      fromDate.getFullYear() === toDate.getFullYear() &&
      fromDate.getMonth() === toDate.getMonth()
    ) {
      return isThisYear(fromDate)
        ? format(fromDate, "MMMM")
        : format(fromDate, "MMMM yyyy");
    }
    return `${fmt(fromDate)} – ${fmt(toDate)}`;
  }
  if (fromDate) return `Since ${fmt(fromDate)}`;
  if (toDate) return `Until ${fmt(toDate)}`;
  return "All time";
}

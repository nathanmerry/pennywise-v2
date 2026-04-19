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
  if (isThisYear(d)) return format(d, "EEE d MMM");
  return format(d, "EEE d MMM yyyy");
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

  const fmtWithYear = (d: Date) =>
    isThisYear(d) ? format(d, "MMM do") : format(d, "MMM do, yyyy");

  if (fromDate && toDate) {
    const sameYear = fromDate.getFullYear() === toDate.getFullYear();
    const sameMonth = sameYear && fromDate.getMonth() === toDate.getMonth();
    if (sameMonth) {
      return `${format(fromDate, "MMMM do")} – ${format(toDate, "do")}${
        isThisYear(fromDate) ? "" : format(fromDate, ", yyyy")
      }`;
    }
    return `${fmtWithYear(fromDate)} – ${fmtWithYear(toDate)}`;
  }
  if (fromDate) return `Since ${fmtWithYear(fromDate)}`;
  if (toDate) return `Until ${fmtWithYear(toDate)}`;
  return "All time";
}

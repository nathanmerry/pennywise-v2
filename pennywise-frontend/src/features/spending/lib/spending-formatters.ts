import { format } from "date-fns";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatTooltipCurrency(value: unknown): string {
  if (typeof value === "number") {
    return formatCurrency(value);
  }

  const numericValue = Number(value ?? 0);
  return formatCurrency(Number.isFinite(numericValue) ? numericValue : 0);
}

export function formatCompactCurrency(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `${amount < 0 ? "-" : ""}£${Math.round(Math.abs(amount) / 100) / 10}k`;
  }
  return `${amount < 0 ? "-" : ""}£${Math.round(Math.abs(amount))}`;
}

export function formatChange(
  amount: number | null,
  percent: number | null,
): string {
  if (amount === null) {
    return "No comparison";
  }

  const sign = amount > 0 ? "+" : "";
  const percentText =
    percent === null ? "" : ` (${sign}${Math.round(percent)}%)`;
  return `${sign}${formatCurrency(amount)}${percentText}`;
}

export function formatDateRangeLabel(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return `${format(startDate, "d MMM yyyy")} - ${format(endDate, "d MMM yyyy")}`;
}

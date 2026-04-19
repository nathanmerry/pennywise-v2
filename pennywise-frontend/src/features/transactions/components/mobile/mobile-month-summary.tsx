import { format, parseISO } from "date-fns";
import { useCurrentBudgetOverview } from "@/shared/hooks/use-budget";
import { useSpendingAnalysis } from "@/shared/hooks/use-budget";
import type { TransactionFilters } from "@/shared/lib/api";
import {
  formatAmount,
  formatDateRangeLabel,
  getFilterMode,
} from "../../lib/group-transactions";

interface Props {
  filters: TransactionFilters;
}

export function MobileMonthSummary({ filters }: Props) {
  const mode = getFilterMode(filters.from, filters.to);

  if (mode === "future") return null;
  if (mode === "past") return <PastRangeSummary filters={filters} />;
  return <CurrentCycleSummary />;
}

function CurrentCycleSummary() {
  const { data, isError, isLoading } = useCurrentBudgetOverview();

  if (isLoading || isError || !data) return null;

  const spent = Math.max(0, data.actualSpend ?? 0);
  const remaining = data.remainingFlexible ?? 0;
  const hasBudget = (data.flexibleBudget ?? 0) > 0;

  const spentLabel = formatAmount(spent, "GBP", { signDisplay: "auto" });

  let trailing: string;
  if (!hasBudget) {
    trailing = "this month";
  } else if (remaining < 0) {
    const over = formatAmount(Math.abs(remaining), "GBP", {
      signDisplay: "auto",
    });
    trailing = `${over} over budget`;
  } else {
    const remainingLabel = formatAmount(remaining, "GBP", {
      signDisplay: "auto",
    });
    const paydayLabel = safeFormatDate(data.paydayDate, "d MMM");
    trailing = paydayLabel
      ? `${remainingLabel} remaining until ${paydayLabel}`
      : `${remainingLabel} remaining`;
  }

  return (
    <div className="text-sm">
      <span className="text-foreground">{spentLabel} spent</span>
      <span className="text-muted-foreground/70"> · {trailing}</span>
    </div>
  );
}

function PastRangeSummary({ filters }: { filters: TransactionFilters }) {
  // Past mode implies `to` is set and in the past. If `from` is missing we default
  // to a distant past so the analytics endpoint still has a valid range.
  const start = filters.from ?? "1970-01-01";
  const end = filters.to!;

  const { data, isLoading, isError } = useSpendingAnalysis({
    start,
    end,
    accountId: filters.accountId,
    categoryId:
      filters.categoryId && filters.categoryId !== "uncategorised"
        ? filters.categoryId
        : undefined,
    // Reproduce the feed's ignored behaviour as closely as the analytics filter allows.
    // The feed can show "only ignored"; analytics cannot — in that rare case we just include all.
    includeIgnored: filters.isIgnored !== "false",
  });

  if (isLoading || isError || !data) return null;

  const spent = Math.max(0, data.summary.totalSpend ?? 0);
  const spentLabel = formatAmount(spent, "GBP", { signDisplay: "auto" });
  const rangeLabel = formatDateRangeLabel(filters.from, filters.to);

  return (
    <div className="text-sm">
      <span className="text-foreground">{spentLabel} spent</span>
      <span className="text-muted-foreground/70"> · {rangeLabel}</span>
    </div>
  );
}

function safeFormatDate(
  iso: string | null | undefined,
  pattern: string,
): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return null;
  }
}

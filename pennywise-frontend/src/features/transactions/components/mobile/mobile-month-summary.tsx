import { format, parseISO } from "date-fns";
import {
  useCurrentBudgetOverview,
  useSpendingAnalysis,
} from "@/shared/hooks/use-budget";
import type { TransactionFilters } from "@/shared/lib/api";
import { formatAmount } from "../../lib/group-transactions";

interface Props {
  filters: TransactionFilters;
}

/**
 * Summary line contract:
 * - "spent" follows the active date filter (historical analysis).
 * - "remaining until payday" is always the current payday cycle (live control metric).
 *
 * The two deliberately use different horizons — "spent" is analytical, "remaining"
 * is live. Mixing them on one line is intentional per product decision.
 */
export function MobileMonthSummary({ filters }: Props) {
  const hasDateFilter = !!filters.from || !!filters.to;
  const { data: overview } = useCurrentBudgetOverview();

  // Analytics endpoint requires both start and end. Fall back to sensible bounds
  // when only one side of the range is set.
  const today = format(new Date(), "yyyy-MM-dd");
  const analysisStart = filters.from ?? "1970-01-01";
  const analysisEnd = filters.to ?? today;

  // Analytics can't express "only ignored" — when the user filters to that, we can't
  // compute a meaningful filtered spent. Fall back to "no filtered spent shown".
  const canUseAnalytics = hasDateFilter && filters.isIgnored !== "true";

  const { data: analysis } = useSpendingAnalysis(
    canUseAnalytics
      ? {
          start: analysisStart,
          end: analysisEnd,
          accountId: filters.accountId,
          categoryId:
            filters.categoryId && filters.categoryId !== "uncategorised"
              ? filters.categoryId
              : undefined,
          // Always exclude ignored — matches BudgetOverview and the feed's visual treatment.
          includeIgnored: false,
        }
      : { start: "", end: "" },
  );

  if (!overview) return null;

  const remaining = overview.remainingFlexible ?? 0;
  const hasBudget = (overview.flexibleBudget ?? 0) > 0;

  const spent = hasDateFilter
    ? canUseAnalytics
      ? analysis?.summary.totalSpend
      : undefined
    : Math.max(0, overview.actualSpend ?? 0);

  const spentLabel =
    spent !== undefined
      ? formatAmount(Math.max(0, spent), "GBP", { signDisplay: "auto" })
      : null;

  const trailing = buildTrailing({
    hasBudget,
    remaining,
    paydayDate: overview.paydayDate,
  });

  if (!spentLabel && !trailing) return null;

  return (
    <div className="text-sm">
      {spentLabel && <span className="text-foreground">{spentLabel} spent</span>}
      {spentLabel && trailing && (
        <span className="text-muted-foreground/70"> · </span>
      )}
      {trailing && (
        <span className="text-muted-foreground/70">{trailing}</span>
      )}
    </div>
  );
}

function buildTrailing({
  hasBudget,
  remaining,
  paydayDate,
}: {
  hasBudget: boolean;
  remaining: number;
  paydayDate: string | null | undefined;
}): string | null {
  if (!hasBudget) return null;
  if (remaining < 0) {
    const over = formatAmount(Math.abs(remaining), "GBP", {
      signDisplay: "auto",
    });
    return `${over} over budget`;
  }
  const remainingLabel = formatAmount(remaining, "GBP", {
    signDisplay: "auto",
  });
  const paydayLabel = safeFormatDate(paydayDate, "d MMM");
  return paydayLabel
    ? `${remainingLabel} remaining until ${paydayLabel}`
    : `${remainingLabel} remaining`;
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

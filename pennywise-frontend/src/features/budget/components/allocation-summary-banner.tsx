import { useBudgetOverview } from "@/shared/hooks/use-budget";
import { cn } from "@/shared/lib/utils";
import { formatCurrency } from "@/features/budget/lib/cycle";

interface AllocationSummaryBannerProps {
  month: string;
}

/**
 * Visible on every Budget tab. Reads `events` and `unallocated` from the overview
 * (server-computed) so the math stays consistent with the page title cards.
 */
export function AllocationSummaryBanner({ month }: AllocationSummaryBannerProps) {
  const { data: overview } = useBudgetOverview(month);
  if (!overview) return null;

  const flexible = overview.flexibleBudget;
  const events = overview.events;
  const categories = flexible - overview.unallocated; // resolved category plan totals
  const overcommitted = overview.unallocated < 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/30 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm",
        overcommitted && "border-destructive/40 bg-destructive/5"
      )}
    >
      <SummaryItem label="Flexible" value={flexible} />
      <Separator />
      <SummaryItem label="Categories" value={categories} />
      <Separator />
      <SummaryItem label="Events" value={events} />
      <Separator />
      <SummaryItem
        label="Unallocated"
        value={overview.unallocated}
        emphasised
        destructive={overcommitted}
      />
    </div>
  );
}

function SummaryItem({
  label,
  value,
  emphasised,
  destructive,
}: {
  label: string;
  value: number;
  emphasised?: boolean;
  destructive?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasised && "font-semibold",
          destructive ? "text-destructive" : "text-foreground"
        )}
      >
        {formatCurrency(value)}
      </span>
    </span>
  );
}

function Separator() {
  return <span aria-hidden className="text-muted-foreground/40">·</span>;
}

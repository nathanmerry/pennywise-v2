import type { AnalysisSummary } from "@/shared/lib/api";
import {
  formatChange,
  formatCurrency,
} from "../lib/spending-formatters";
import { SummaryCard } from "./summary-card";

export function SpendingSummaryGrid({
  summary,
  dayCount,
}: {
  summary: AnalysisSummary;
  dayCount: number;
}) {
  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5'>
      <SummaryCard
        title='Total spend'
        primary={formatCurrency(summary.totalSpend)}
        secondary={formatChange(summary.changeAmount, summary.changePercent)}
      />
      <SummaryCard
        title='Average per day'
        primary={formatCurrency(summary.avgPerDay)}
        secondary={`${dayCount} days in range`}
      />
      <SummaryCard
        title='Highest category'
        primary={summary.highestCategory?.categoryName ?? "No spend"}
        secondary={
          summary.highestCategory
            ? formatCurrency(summary.highestCategory.spend)
            : "Nothing in this range"
        }
      />
      <SummaryCard
        title='Transaction count'
        primary={summary.transactionCount.toLocaleString()}
        secondary='Posted outflows only'
      />
      <SummaryCard
        title='Recurring spend'
        primary={formatCurrency(summary.recurringSpend)}
        secondary='Estimated recurring charges'
      />
    </div>
  );
}

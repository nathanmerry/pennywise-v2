import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisTimeSeriesPoint } from "@/shared/lib/api";
import {
  formatCompactCurrency,
  formatTooltipCurrency,
} from "../lib/spending-formatters";

function tooltipLabelFormatter(_: unknown, payload: unknown) {
  const items = payload as
    | Array<{ payload?: { currentDate?: string } }>
    | undefined;
  const currentDate = items?.[0]?.payload?.currentDate;
  return currentDate
    ? format(new Date(`${currentDate}T00:00:00.000Z`), "d MMM yyyy")
    : "";
}

export function DailySpendChart({
  data,
  showPrevious,
}: {
  data: AnalysisTimeSeriesPoint[];
  showPrevious: boolean;
}) {
  return (
    <ResponsiveContainer width='100%' height='100%'>
      <LineChart data={data} key='daily'>
        <CartesianGrid strokeDasharray='3 3' vertical={false} />
        <XAxis dataKey='label' minTickGap={24} />
        <YAxis tickFormatter={formatCompactCurrency} width={56} />
        <Tooltip
          formatter={(value) => formatTooltipCurrency(value)}
          labelFormatter={tooltipLabelFormatter}
        />
        <Line
          type='linear'
          dataKey='currentSpend'
          stroke='var(--chart-1)'
          strokeWidth={2}
          dot={false}
          name='Current period'
        />
        {showPrevious && (
          <Line
            type='linear'
            dataKey='previousSpend'
            stroke='var(--muted-foreground)'
            strokeDasharray='4 4'
            strokeWidth={2}
            dot={false}
            name='Previous period'
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CumulativeSpendChart({
  data,
  showPrevious,
}: {
  data: AnalysisTimeSeriesPoint[];
  showPrevious: boolean;
}) {
  return (
    <ResponsiveContainer width='100%' height='100%'>
      <LineChart data={data} key='cumulative'>
        <CartesianGrid strokeDasharray='3 3' vertical={false} />
        <XAxis dataKey='label' minTickGap={24} />
        <YAxis tickFormatter={formatCompactCurrency} width={56} />
        <Tooltip
          formatter={(value) => formatTooltipCurrency(value)}
          labelFormatter={tooltipLabelFormatter}
        />
        <Line
          type='linear'
          dataKey='currentCumulative'
          stroke='var(--chart-1)'
          strokeWidth={2}
          dot={false}
          name='Current period'
        />
        {showPrevious && (
          <Line
            type='linear'
            dataKey='previousCumulative'
            stroke='var(--muted-foreground)'
            strokeDasharray='4 4'
            strokeWidth={2}
            dot={false}
            name='Previous period'
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

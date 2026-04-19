import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCompactCurrency,
  formatTooltipCurrency,
} from "../lib/spending-formatters";

export interface WeeklyPoint {
  label: string;
  weekStart: string;
  currentSpend: number;
  previousSpend: number | null;
}

export function WeeklySpendChart({
  data,
  showPrevious,
  weeklyBudgetAllowance,
}: {
  data: WeeklyPoint[];
  showPrevious: boolean;
  weeklyBudgetAllowance: number | null;
}) {
  return (
    <ResponsiveContainer width='100%' height='100%'>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray='3 3' vertical={false} />
        <XAxis dataKey='label' />
        <YAxis tickFormatter={formatCompactCurrency} width={56} />
        <Tooltip formatter={(value) => formatTooltipCurrency(value)} />
        <Bar
          dataKey='currentSpend'
          fill='var(--chart-1)'
          radius={[4, 4, 0, 0]}
          name='Current period'
        />
        {showPrevious && (
          <Bar
            dataKey='previousSpend'
            fill='var(--muted-foreground)'
            radius={[4, 4, 0, 0]}
            opacity={0.4}
            name='Previous period'
          />
        )}
        {weeklyBudgetAllowance !== null && (
          <ReferenceLine
            y={weeklyBudgetAllowance}
            stroke='var(--destructive)'
            strokeDasharray='6 4'
            strokeWidth={1.5}
            label={{
              value: "Weekly budget",
              position: "right",
              fontSize: 11,
              fill: "var(--destructive)",
            }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

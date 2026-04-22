import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import type { AnalysisTimeSeriesPoint } from "@/shared/lib/api";
import { formatCurrency } from "../lib/spending-formatters";
import {
  CumulativeSpendChart,
  DailySpendChart,
} from "./spend-line-chart";
import { WeeklySpendChart, type WeeklyPoint } from "./weekly-spend-chart";

export type ChartMode = "daily" | "cumulative" | "weekly";

interface SpendingChartsCardProps {
  chartMode: ChartMode;
  onChartModeChange: (mode: ChartMode) => void;
  series: AnalysisTimeSeriesPoint[];
  cumulativeSeries: AnalysisTimeSeriesPoint[];
  weeklyData: WeeklyPoint[];
  showPrevious: boolean;
  totalSpend: number;
  avgPerDay: number;
  periodLabel: string;
}

export function SpendingChartsCard({
  chartMode,
  onChartModeChange,
  series,
  cumulativeSeries,
  weeklyData,
  showPrevious,
  totalSpend,
  avgPerDay,
  periodLabel,
}: SpendingChartsCardProps) {
  return (
    <Card>
      <CardHeader className='space-y-1'>
        <CardTitle className='text-base'>Spend over time</CardTitle>
        <p className='text-sm text-muted-foreground'>
          {formatCurrency(totalSpend)} total · {formatCurrency(avgPerDay)}/day
          avg · {periodLabel}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs
          value={chartMode}
          onValueChange={(value) => onChartModeChange(value as ChartMode)}
          className='space-y-4'
        >
          <TabsList>
            <TabsTrigger value='daily'>Daily spend</TabsTrigger>
            <TabsTrigger value='cumulative'>Cumulative spend</TabsTrigger>
            <TabsTrigger value='weekly'>Weekly spend</TabsTrigger>
          </TabsList>

          <div className='h-64 w-full sm:h-80'>
            {chartMode === "weekly" ? (
              <WeeklySpendChart
                data={weeklyData}
                showPrevious={showPrevious}
              />
            ) : chartMode === "cumulative" ? (
              <CumulativeSpendChart
                data={cumulativeSeries}
                showPrevious={showPrevious}
              />
            ) : (
              <DailySpendChart data={series} showPrevious={showPrevious} />
            )}
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}

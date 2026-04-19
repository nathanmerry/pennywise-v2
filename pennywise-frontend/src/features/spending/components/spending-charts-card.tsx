import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import type { AnalysisTimeSeriesPoint } from "@/shared/lib/api";
import {
  CumulativeSpendChart,
  DailySpendChart,
} from "./spend-line-chart";
import { WeeklySpendChart, type WeeklyPoint } from "./weekly-spend-chart";

export type ChartMode = "daily" | "cumulative" | "weekly";

type CumulativePoint = AnalysisTimeSeriesPoint & { budgetPace?: number };

interface SpendingChartsCardProps {
  chartMode: ChartMode;
  onChartModeChange: (mode: ChartMode) => void;
  series: AnalysisTimeSeriesPoint[];
  cumulativeSeries: CumulativePoint[];
  weeklyData: WeeklyPoint[];
  showPrevious: boolean;
  showBudgetPace: boolean;
  dailyBudgetPace: number | null;
  weeklyBudgetAllowance: number | null;
  budgetStatusLabel: string | null;
}

export function SpendingChartsCard({
  chartMode,
  onChartModeChange,
  series,
  cumulativeSeries,
  weeklyData,
  showPrevious,
  showBudgetPace,
  dailyBudgetPace,
  weeklyBudgetAllowance,
  budgetStatusLabel,
}: SpendingChartsCardProps) {
  return (
    <Card>
      <CardHeader className='space-y-2'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <CardTitle className='text-base'>Spend over time</CardTitle>
            <p className='text-sm text-muted-foreground'>
              Track spikes, pacing, and whether the current period is separating
              from the last one.
            </p>
          </div>
          {budgetStatusLabel && (
            <Badge variant='outline' className='shrink-0'>
              {budgetStatusLabel}
            </Badge>
          )}
        </div>
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
                weeklyBudgetAllowance={weeklyBudgetAllowance}
              />
            ) : chartMode === "cumulative" ? (
              <CumulativeSpendChart
                data={cumulativeSeries}
                showPrevious={showPrevious}
                showBudgetPace={showBudgetPace}
              />
            ) : (
              <DailySpendChart
                data={series}
                showPrevious={showPrevious}
                dailyBudgetPace={dailyBudgetPace}
              />
            )}
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}

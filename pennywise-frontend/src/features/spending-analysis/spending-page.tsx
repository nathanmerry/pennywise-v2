import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useAccounts } from "@/shared/hooks/use-accounts";
import { useCategories } from "@/shared/hooks/use-categories";
import { useRecentCycles, useSpendingAnalysis } from "@/shared/hooks/use-budget";
import { useSpendingPageState } from "./hooks/use-spending-page-state";
import { useSpendingAnalysisViewModel } from "./hooks/use-spending-analysis-view-model";
import { SpendingAnalysisDrawer } from "./components/spending-analysis-drawer";
import { CategoryBreakdownCard } from "./components/category-breakdown-card";
import { SpendingChartsCard } from "./components/spending-charts-card";
import { SpendingFiltersPanel } from "./components/spending-filters-panel";
import { TopMerchantsCard } from "./components/top-merchants-card";

function SpendingPageSkeleton() {
  return (
    <div className='grid gap-4 xl:grid-cols-[1.7fr,0.9fr]'>
      <Skeleton className='h-96' />
      <Skeleton className='h-96' />
      <Skeleton className='h-[480px] xl:col-span-2' />
    </div>
  );
}

export function SpendingPage() {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: cyclesData, isLoading: isCyclesLoading } = useRecentCycles(12);
  const cycles = cyclesData?.cycles ?? [];
  const hasCycles = cycles.length > 0;
  const state = useSpendingPageState(cycles);
  const { data: analysis, isLoading: isAnalysisLoading } = useSpendingAnalysis(
    hasCycles ? state.filters : { start: "", end: "" },
  );
  const viewModel = useSpendingAnalysisViewModel(
    analysis,
    state.sortKey,
    state.sortDirection,
  );

  const showPrevious = state.comparePrevious && !!analysis?.previousPeriod;
  const showBudgetColumn = !!analysis?.budgetContext.applicable;
  const isLoading = isCyclesLoading || (hasCycles && isAnalysisLoading);

  if (!isCyclesLoading && !hasCycles) {
    return (
      <Card>
        <CardContent className='py-12 text-center text-muted-foreground'>
          <p className='mb-2 text-base font-medium text-foreground'>
            Set up your pay cycle to see spending analysis
          </p>
          <p className='text-sm'>
            Spending Analysis is organised around pay cycles. Create a budget
            month with a payday to unlock this view.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      <SpendingFiltersPanel
        preset={state.preset}
        onPresetChange={state.setPreset}
        customRange={state.customRange}
        onCustomRangeChange={state.setCustomRange}
        accountId={state.accountId}
        onAccountIdChange={state.setAccountId}
        categoryId={state.categoryId}
        onCategoryIdChange={state.setCategoryId}
        comparePrevious={state.comparePrevious}
        onComparePreviousChange={state.setComparePrevious}
        includeIgnored={state.includeIgnored}
        onIncludeIgnoredChange={state.setIncludeIgnored}
        accounts={accounts}
        categories={categories}
        periodLabel={state.periodLabel}
        hasCustomFilters={state.hasCustomFilters}
        onReset={state.resetFilters}
      />

      {isLoading ? (
        <SpendingPageSkeleton />
      ) : analysis ? (
        <div className='grid gap-4 xl:grid-cols-[1.7fr,0.9fr]'>
          <CategoryBreakdownCard
            flexibleCategories={viewModel.flexibleCategories}
            fixedCategories={viewModel.fixedCategories}
            onToggleSort={state.toggleSort}
            selectedCategoryId={state.selectedCategoryId}
            onSelectCategory={state.setSelectedCategoryId}
            showVsPrevious={showPrevious}
            showBudget={showBudgetColumn}
          />

          <SpendingChartsCard
            chartMode={state.chartMode}
            onChartModeChange={state.setChartMode}
            series={analysis.series}
            cumulativeSeries={viewModel.cumulativeSeries}
            weeklyData={viewModel.weeklyData}
            showPrevious={showPrevious}
            totalSpend={analysis.summary.totalSpend}
            avgPerDay={analysis.summary.avgPerDay}
            periodLabel={state.periodLabel}
          />

          <TopMerchantsCard merchants={analysis.topMerchants} />
        </div>
      ) : (
        <Card>
          <CardContent className='py-12 text-center text-muted-foreground'>
            No spending data found for the current filters.
          </CardContent>
        </Card>
      )}

      <SpendingAnalysisDrawer
        open={state.selectedCategoryId !== null}
        onOpenChange={(open) => !open && state.setSelectedCategoryId(null)}
        categoryId={state.selectedCategoryId}
        filters={state.filters}
      />
    </div>
  );
}

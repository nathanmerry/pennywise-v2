import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useAccounts } from "@/shared/hooks/use-accounts";
import { useCategories } from "@/shared/hooks/use-categories";
import { useSpendingAnalysis } from "@/shared/hooks/use-budget";
import { useSpendingPageState } from "./hooks/use-spending-page-state";
import { useSpendingAnalysisViewModel } from "./hooks/use-spending-analysis-view-model";
import { SpendingAnalysisDrawer } from "./components/spending-analysis-drawer";
import { CategoryBreakdownCard } from "./components/category-breakdown-card";
import { SpendingChartsCard } from "./components/spending-charts-card";
import { SpendingFiltersPanel } from "./components/spending-filters-panel";
import { SpendingSummaryGrid } from "./components/summary-grid";
import { TopMerchantsCard } from "./components/top-merchants-card";
import { WhatToDoNowCard } from "./components/what-to-do-now-card";

function SpendingPageSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5'>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className='h-28' />
        ))}
      </div>
      <div className='grid gap-4 xl:grid-cols-[1.7fr,0.9fr]'>
        <Skeleton className='h-96' />
        <Skeleton className='h-96' />
      </div>
      <Skeleton className='h-[480px]' />
    </div>
  );
}

export function SpendingPage() {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const state = useSpendingPageState(accounts, categories);
  const { data: analysis, isLoading } = useSpendingAnalysis(state.filters);
  const viewModel = useSpendingAnalysisViewModel(
    analysis,
    state.sortKey,
    state.sortDirection,
  );

  const overall = analysis?.budgetContext.overall ?? null;
  const hasBudgetContext =
    !!analysis?.budgetContext.applicable && !!overall;
  const budgetStatusLabel =
    hasBudgetContext && overall ? overall.status.replace("_", " ") : null;
  const showPrevious = state.comparePrevious && !!analysis?.previousPeriod;

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
        selectedAccountLabel={state.selectedAccountLabel}
        selectedCategoryLabel={state.selectedCategoryLabel}
        hasCustomFilters={state.hasCustomFilters}
        onReset={state.resetFilters}
      />

      {isLoading ? (
        <SpendingPageSkeleton />
      ) : analysis ? (
        <>
          {overall && hasBudgetContext && (
            <WhatToDoNowCard
              overall={overall}
              projection={viewModel.flexibleProjection}
            />
          )}

          <SpendingSummaryGrid
            summary={analysis.summary}
            dayCount={analysis.currentPeriod.dayCount}
          />

          <div className='grid gap-4 xl:grid-cols-[1.7fr,0.9fr]'>
            <SpendingChartsCard
              chartMode={state.chartMode}
              onChartModeChange={state.setChartMode}
              series={analysis.series}
              cumulativeSeries={viewModel.cumulativeSeries}
              weeklyData={viewModel.weeklyData}
              showPrevious={showPrevious}
              showBudgetPace={hasBudgetContext}
              dailyBudgetPace={viewModel.dailyBudgetPace}
              weeklyBudgetAllowance={viewModel.weeklyBudgetAllowance}
              budgetStatusLabel={budgetStatusLabel}
            />

            <CategoryBreakdownCard
              flexibleCategories={viewModel.flexibleCategories}
              fixedCategories={viewModel.fixedCategories}
              onToggleSort={state.toggleSort}
              selectedCategoryId={state.selectedCategoryId}
              onSelectCategory={state.setSelectedCategoryId}
              budgetStatusLabel={budgetStatusLabel}
            />

            <TopMerchantsCard merchants={analysis.topMerchants} />
          </div>
        </>
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

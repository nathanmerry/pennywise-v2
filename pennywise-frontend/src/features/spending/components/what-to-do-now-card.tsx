import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { AnalysisBudgetContext } from "@/shared/lib/api";
import { formatCurrency } from "../lib/spending-formatters";

type OverallBudget = NonNullable<AnalysisBudgetContext["overall"]>;

export function WhatToDoNowCard({
  overall,
  projection,
}: {
  overall: OverallBudget;
  projection: { projectedTotal: number; projectedOverage: number } | null;
}) {
  const paceDelta = overall.paceDelta;
  const safeDaily = overall.safeDailySpend;
  const remaining = overall.remainingFlexibleBudget;

  const paceLine =
    paceDelta > 50
      ? `${formatCurrency(paceDelta)} over flexible pace.`
      : paceDelta < -50
        ? `${formatCurrency(Math.abs(paceDelta))} under flexible pace.`
        : "On flexible pace.";

  const safeLine =
    remaining > 0
      ? `Safe flexible spend today: ${formatCurrency(safeDaily)}.`
      : "Flexible budget exhausted for this month.";

  const projectionText = projection
    ? projection.projectedOverage > 50
      ? `On track to finish ${formatCurrency(projection.projectedOverage)} over flexible budget.`
      : projection.projectedOverage < -50
        ? `On track to finish ${formatCurrency(Math.abs(projection.projectedOverage))} under flexible budget.`
        : "Projected to finish roughly on budget."
    : null;

  return (
    <Card className='border-primary/40'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground'>
          What to do now
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-1'>
        <p className='text-2xl font-semibold leading-snug'>
          {paceLine} <span className='text-primary'>{safeLine}</span>
        </p>
        {projectionText && (
          <p className='text-xs text-muted-foreground'>{projectionText}</p>
        )}
      </CardContent>
    </Card>
  );
}

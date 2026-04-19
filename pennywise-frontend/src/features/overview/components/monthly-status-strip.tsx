import { Card, CardContent } from "@/shared/components/ui/card";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  getMonthlyStatusFromPace,
  getMonthlyStatus,
  type MonthlyStatusTone,
  type LegacyStatusInput,
} from "@/features/overview/lib/monthly-status";
import type { MonthlyBudgetPace } from "@/shared/lib/api";
import { PaceExplanation } from "@/features/overview/components/pace-explanation";

// Props for pace-based status (Layer 2)
interface PaceStatusStripProps {
  pace: MonthlyBudgetPace;
}

// Props for legacy status (Layer 1 fallback)
interface LegacyStatusStripProps {
  remainingFlexibleBudget: number;
  flexibleBudget: number;
  safeDailySpend: number;
  overBudgetCategories: {
    categoryId: string;
    categoryName: string;
    spent: number;
    budget: number;
    remaining: number;
  }[];
  daysUntilPayday?: number;
}

type MonthlyStatusStripProps = PaceStatusStripProps | LegacyStatusStripProps;

const toneStyles: Record<MonthlyStatusTone, string> = {
  neutral: "border-border",
  warning: "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20",
  destructive: "border-destructive/50 bg-destructive/5",
};

const toneIconStyles: Record<MonthlyStatusTone, string> = {
  neutral: "text-green-600",
  warning: "text-amber-600",
  destructive: "text-destructive",
};

function StatusIcon({ tone }: { tone: MonthlyStatusTone }) {
  const className = cn("h-5 w-5", toneIconStyles[tone]);
  
  switch (tone) {
    case "neutral":
      return <CheckCircle2 className={className} />;
    case "warning":
      return <AlertTriangle className={className} />;
    case "destructive":
      return <XCircle className={className} />;
  }
}

function isPaceProps(props: MonthlyStatusStripProps): props is PaceStatusStripProps {
  return "pace" in props;
}

export function MonthlyStatusStrip(props: MonthlyStatusStripProps) {
  let status;

  if (isPaceProps(props)) {
    // Layer 2: Use real pace data
    status = getMonthlyStatusFromPace(props.pace);
  } else {
    // Layer 1 fallback: Use legacy logic
    const input: LegacyStatusInput = {
      remainingFlexibleBudget: props.remainingFlexibleBudget,
      flexibleBudget: props.flexibleBudget,
      safeDailySpend: props.safeDailySpend,
      overBudgetCategories: props.overBudgetCategories.map((cat) => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        spent: cat.spent,
        budget: cat.budget,
        overAmount: Math.abs(cat.remaining),
      })),
      daysUntilPayday: props.daysUntilPayday,
    };
    status = getMonthlyStatus(input);
  }

  return (
    <Card className={cn("transition-colors", toneStyles[status.tone])}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <StatusIcon tone={status.tone} />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base">{status.headline}</h2>
            <p className={cn(
              "text-lg font-semibold mt-1 inline-flex items-center gap-1.5",
              status.tone === "destructive" && "text-destructive",
              status.tone === "warning" && "text-amber-600"
            )}>
              {status.primaryStat}
              {status.primaryStat.includes("expected") && (
                <PaceExplanation type="overall" />
              )}
            </p>
            {status.secondaryFacts.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {status.secondaryFacts.map((fact: string, i: number) => (
                  <span key={i} className="text-sm text-muted-foreground">
                    {fact}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

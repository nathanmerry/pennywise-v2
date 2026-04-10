import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  useGenerateBudgetRecommendations,
  useApplyBudgetRecommendations,
  useCategoryEvidence,
} from "@/hooks/use-budget";
import type {
  ApplySelection,
  BudgetRecommendationResponse,
  CategoryEvidence,
  CategoryRecommendation,
  RecommendationBranch,
} from "@/lib/api";
import {
  AlertTriangle,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Equal,
  Minus,
  Sparkles,
  TrendingDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-GB", { month: "short" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ============================================================================
// PLAN DELTA — the core status signal for each category
// ============================================================================

type PlanDelta = "close_to_history" | "slight_trim" | "strong_trim" | "needs_manual" | "insufficient";

function getPlanDelta(cat: CategoryRecommendation): PlanDelta {
  if (cat.variabilityClass === "low_signal" || cat.confidence === "low") return "insufficient";
  if (cat.recommendedBudget === null) return "needs_manual";
  if (cat.adjustmentVsAverage === null) return "close_to_history";

  const trimPercent = cat.historicalAverage > 0
    ? Math.abs(cat.adjustmentVsAverage) / cat.historicalAverage
    : 0;

  if (trimPercent < 0.05) return "close_to_history";
  if (trimPercent < 0.15) return "slight_trim";
  return "strong_trim";
}

const PLAN_DELTA_CONFIG: Record<PlanDelta, { label: string; className: string; icon: typeof Check }> = {
  close_to_history: { label: "Matches history", className: "bg-green-50 text-green-700 border-green-200", icon: Equal },
  slight_trim: { label: "Slight trim", className: "bg-amber-50 text-amber-700 border-amber-200", icon: TrendingDown },
  strong_trim: { label: "Trimmed", className: "bg-orange-50 text-orange-700 border-orange-200", icon: TrendingDown },
  needs_manual: { label: "Set manually", className: "bg-slate-50 text-slate-600 border-slate-200", icon: Minus },
  insufficient: { label: "Low data", className: "bg-gray-50 text-gray-500 border-gray-200", icon: Minus },
};

// ============================================================================
// EVIDENCE PANEL — transaction-level detail for the "Why?" section
// ============================================================================

function buildInterpretation(cat: CategoryRecommendation, evidence: CategoryEvidence | undefined): string {
  if (!cat.recommendedBudget) {
    return "Not enough spending history to suggest a budget.";
  }

  const spike = evidence?.spikeMonth;
  const topMerchant = evidence?.topMerchants?.[0];
  const delta = getPlanDelta(cat);

  if (delta === "close_to_history") {
    if (topMerchant && evidence && evidence.topMerchants.length <= 2) {
      return `Most spending here goes to ${topMerchant.merchantName}. The suggestion matches your typical month.`;
    }
    return "Your spending here is consistent, so the suggestion stays close to what you actually spend.";
  }

  if (delta === "slight_trim" || delta === "strong_trim") {
    const trimAmt = Math.abs(cat.adjustmentVsAverage ?? 0);
    if (spike && evidence?.spikeAmount) {
      const spikeLabel = formatShortMonth(spike);
      return `${spikeLabel} had a spike of ${formatCurrency(evidence.spikeAmount)}, which pulled your average up. The suggestion trims ${formatCurrency(trimAmt)} to target a more typical month.`;
    }
    if (cat.variabilityClass === "spiky") {
      return `This category swings a lot. The suggestion is ${formatCurrency(trimAmt)} below your average to keep things realistic.`;
    }
    return `Trimmed ${formatCurrency(trimAmt)} from your average to help your budget fit within target.`;
  }

  return "Based on your recent spending.";
}

function EvidencePanel({
  evidence,
}: {
  evidence: CategoryEvidence | undefined;
}) {
  if (!evidence) return null;

  return (
    <div className="mt-2 space-y-3">
      {/* Mini bar chart */}
      {evidence.monthlyTotals.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Monthly spending</p>
          <div className="flex h-12 items-end gap-1.5">
            {evidence.monthlyTotals.map((mt) => {
              const maxTotal = Math.max(...evidence.monthlyTotals.map(m => m.total), 1);
              const heightPct = maxTotal > 0 ? (mt.total / maxTotal) * 100 : 0;
              const isSpike = evidence.spikeMonth === mt.month;
              return (
                <div key={mt.month} className="flex flex-1 flex-col items-center gap-0.5">
                  <div
                    className={cn(
                      "w-full rounded-sm min-h-[2px] transition-all",
                      isSpike ? "bg-orange-400" : mt.total > 0 ? "bg-primary/60" : "bg-muted"
                    )}
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{formatShortMonth(mt.month)}</span>
                  {mt.total > 0 && (
                    <span className="text-[10px] font-medium">{formatCurrency(mt.total)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Top merchants */}
        {evidence.topMerchants.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Top merchants</p>
            <div className="space-y-0.5">
              {evidence.topMerchants.slice(0, 3).map((m) => (
                <div key={m.merchantName} className="flex justify-between text-xs">
                  <span className="mr-2 truncate">{m.merchantName}</span>
                  <span className="shrink-0 text-muted-foreground">{formatCurrency(m.totalSpend)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Biggest transactions */}
        {evidence.biggestTransactions.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Largest purchases</p>
            <div className="space-y-0.5">
              {evidence.biggestTransactions.slice(0, 3).map((tx, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="mr-2 truncate">
                    {formatShortDate(tx.date)} — {tx.merchantName || tx.description.slice(0, 20)}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatCurrency(tx.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function generateFallbackRationale(category: CategoryRecommendation): string {
  const {
    variabilityClass,
    historicalAverage,
    historicalMedian,
    recommendedBudget,
    adjustmentVsAverage,
  } = category;

  if (!recommendedBudget) {
    return "Not enough spending history to make a confident recommendation.";
  }

  const trimAmount = adjustmentVsAverage ? Math.abs(adjustmentVsAverage) : 0;
  const trimPercent = historicalAverage > 0 ? Math.round((trimAmount / historicalAverage) * 100) : 0;

  switch (variabilityClass) {
    case "stable":
      return `You spend consistently here (£${Math.round(historicalMedian)}-£${Math.round(historicalAverage)}/month), so the suggestion matches your typical month.`;

    case "regular_lifestyle":
      if (trimPercent > 5) {
        return `Regular spending with some variation. Trimmed ${trimPercent}% from your average to help with savings.`;
      }
      return "You spend here regularly with some variation. The suggestion stays close to your typical month.";

    case "variable":
      return `Your spending here varies month to month. The suggestion leans on your median (£${Math.round(historicalMedian)}) to avoid overbudgeting.`;

    case "spiky":
      if (historicalMedian < historicalAverage * 0.5) {
        return "This category has occasional large purchases but many quiet months. The suggestion is conservative, based on typical months rather than peaks.";
      }
      return "Spending here swings a lot. The suggestion is set conservatively below your average to account for the unpredictability.";

    case "low_signal":
      return "There is only limited recent history here, so confidence is low.";

    default:
      return "Based on your recent spending patterns.";
  }
}

function getRationale(category: CategoryRecommendation): string {
  return category.rationale?.trim() || generateFallbackRationale(category);
}

function needsManualAttention(category: CategoryRecommendation): boolean {
  return (
    category.recommendedBudget === null ||
    category.confidence === "low" ||
    category.variabilityClass === "low_signal" ||
    category.recommendationStatus === "needs_budget_no_recommendation"
  );
}

interface RecommendationRowProps {
  category: CategoryRecommendation;
  branch?: RecommendationBranch;
  selected: boolean;
  editedBudget: number | null;
  onToggle: () => void;
  onEditBudget: (value: number | null) => void;
  evidence?: CategoryEvidence;
}

function RecommendationRow({
  category,
  branch,
  selected,
  editedBudget,
  onToggle,
  onEditBudget,
  evidence,
}: RecommendationRowProps) {
  const [expanded, setExpanded] = useState(false);
  const displayBudget = editedBudget ?? category.recommendedBudget;
  const hasRecommendation = category.recommendedBudget !== null;
  const isLowConfidence = category.confidence === "low" || category.variabilityClass === "low_signal";
  const isTrimmed = category.recommendationStatus === "trimmed_for_savings";
  const delta = getPlanDelta(category);
  const deltaConfig = PLAN_DELTA_CONFIG[delta];
  const DeltaIcon = deltaConfig.icon;
  const topDrivers = branch?.budgetLevel === "parent"
    ? branch.driverCategories.slice(0, 3)
    : [];

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border bg-background",
        isLowConfidence && "border-dashed border-amber-300 bg-amber-50/60",
        !hasRecommendation && "opacity-85",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          disabled={!hasRecommendation}
          className="mt-0.5 shrink-0"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("truncate text-sm font-medium", !hasRecommendation && "text-muted-foreground")}>
                  {category.categoryName}
                </span>
                <Badge variant="outline" className={cn("shrink-0 text-[11px] px-1.5 py-0", deltaConfig.className)}>
                  <DeltaIcon className="mr-0.5 h-3 w-3" />
                  {deltaConfig.label}
                </Badge>
                {category.budgetLevel === "child" && (
                  <Badge variant="outline" className="shrink-0">
                    Child budget
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Typical month <span className="font-medium text-foreground">{formatCurrency(category.historicalAverage)}</span>
                {category.currentBudget !== null && (
                  <span> · current budget {formatCurrency(category.currentBudget)}</span>
                )}
              </p>

              {topDrivers.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Top drivers:{" "}
                  {topDrivers.map((driver, index) => (
                    <span key={driver.categoryId}>
                      {index > 0 && ", "}
                      <span className="font-medium text-foreground">{driver.categoryName}</span>
                      <span> {formatCurrency(driver.historicalAverage)}</span>
                    </span>
                  ))}
                </p>
              )}
            </div>

            <div className="w-32 shrink-0 rounded-xl border bg-background p-2 shadow-sm">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {hasRecommendation ? "Suggested" : "Manual review"}
              </p>
              {isTrimmed && category.adjustmentVsAverage !== null && (
                <div className="mb-2 flex items-center gap-1 text-xs text-amber-600">
                  <TrendingDown className="h-3 w-3" />
                  {formatCurrency(Math.abs(category.adjustmentVsAverage))}
                </div>
              )}
              {hasRecommendation ? (
                <Input
                  type="number"
                  value={displayBudget ?? ""}
                  onChange={(e) => onEditBudget(e.target.value ? Number(e.target.value) : null)}
                  className="h-10 w-full text-base font-semibold"
                />
              ) : (
                <div className="rounded-md bg-muted px-2 py-2 text-xs text-muted-foreground">
                  Review manually
                </div>
              )}
            </div>
          </div>

          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {expanded ? "Hide details" : "Why this amount?"}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p className="text-sm leading-relaxed">
                {evidence ? buildInterpretation(category, evidence) : getRationale(category)}
              </p>
              {branch && (
                <p>
                  {branch.resolutionReason}
                  {isLowConfidence && " This line is shown, but confidence is low because recent history is sparse."}
                </p>
              )}
              {evidence && <EvidencePanel evidence={evidence} />}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}

interface BranchCardProps {
  branch: RecommendationBranch;
  categories: CategoryRecommendation[];
  selections: Map<string, { selected: boolean; editedBudget: number | null }>;
  evidence: Record<string, CategoryEvidence> | undefined;
  manualAttention?: boolean;
  onToggle: (categoryId: string) => void;
  onEditBudget: (categoryId: string, value: number | null) => void;
  onSelectBranch: () => void;
  onDeselectBranch: () => void;
}

function BranchCard({
  branch,
  categories,
  selections,
  evidence,
  manualAttention = false,
  onToggle,
  onEditBudget,
  onSelectBranch,
  onDeselectBranch,
}: BranchCardProps) {
  const selectableCount = categories.filter((category) => category.recommendedBudget !== null).length;
  const selectedCount = categories.filter((category) => selections.get(category.categoryId)?.selected).length;
  const parentCategory = branch.budgetLevel === "parent" ? categories[0] : null;

  return (
    <div className={cn("rounded-xl border p-4 space-y-4", manualAttention && "border-amber-300 bg-amber-50/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="truncate font-medium">{branch.branchCategoryName}</h3>
            <Badge variant="secondary">
              {branch.budgetLevel === "parent" ? "Parent budget" : "Preserving child split"}
            </Badge>
            {manualAttention && (
              <Badge className="border-0 bg-amber-100 text-amber-800">
                Manual attention
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {branch.resolutionReason}
          </p>
        </div>
        <div className="text-right text-sm text-muted-foreground shrink-0">
          <div>{formatCurrency(branch.historicalAverage)} avg</div>
          <div>{selectedCount}/{categories.length} selected</div>
        </div>
      </div>

      {selectableCount > 1 && (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onSelectBranch}>
            Accept branch
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onDeselectBranch}>
            Skip branch
          </Button>
        </div>
      )}

      {parentCategory ? (
        <RecommendationRow
          category={parentCategory}
          branch={branch}
          selected={selections.get(parentCategory.categoryId)?.selected ?? false}
          editedBudget={selections.get(parentCategory.categoryId)?.editedBudget ?? null}
          onToggle={() => onToggle(parentCategory.categoryId)}
          onEditBudget={(value) => onEditBudget(parentCategory.categoryId, value)}
          evidence={evidence?.[parentCategory.categoryId]}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {categories.map((category) => (
            <RecommendationRow
              key={category.categoryId}
              category={category}
              selected={selections.get(category.categoryId)?.selected ?? false}
              editedBudget={selections.get(category.categoryId)?.editedBudget ?? null}
              onToggle={() => onToggle(category.categoryId)}
              onEditBudget={(value) => onEditBudget(category.categoryId, value)}
              evidence={evidence?.[category.categoryId]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface BudgetRecommendationsPanelProps {
  month: string;
  onClose: () => void;
}

export function BudgetRecommendationsPanel({
  month,
  onClose,
}: BudgetRecommendationsPanelProps) {
  const generateMutation = useGenerateBudgetRecommendations();
  const applyMutation = useApplyBudgetRecommendations();
  const { data: evidenceData } = useCategoryEvidence(month, true);

  const [recommendations, setRecommendations] = useState<BudgetRecommendationResponse | null>(null);
  const [selections, setSelections] = useState<Map<string, { selected: boolean; editedBudget: number | null }>>(new Map());

  const handleGenerate = async () => {
    const result = await generateMutation.mutateAsync(month);
    setRecommendations(result);

    const initialSelections = new Map<string, { selected: boolean; editedBudget: number | null }>();
    for (const category of result.categories) {
      const shouldSelect =
        category.recommendedBudget !== null &&
        category.confidence !== "low" &&
        category.recommendationStatus !== "needs_budget_no_recommendation";

      initialSelections.set(category.categoryId, {
        selected: shouldSelect,
        editedBudget: null,
      });
    }
    setSelections(initialSelections);
  };

  const handleToggle = (categoryId: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(categoryId) || { selected: false, editedBudget: null };
      next.set(categoryId, { ...current, selected: !current.selected });
      return next;
    });
  };

  const handleEditBudget = (categoryId: string, value: number | null) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(categoryId) || { selected: false, editedBudget: null };
      next.set(categoryId, { ...current, editedBudget: value });
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!recommendations) return;
    setSelections((prev) => {
      const next = new Map(prev);
      for (const category of recommendations.categories) {
        if (category.recommendedBudget !== null) {
          const current = next.get(category.categoryId) || { selected: false, editedBudget: null };
          next.set(category.categoryId, { ...current, selected: true });
        }
      }
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelections((prev) => {
      const next = new Map(prev);
      for (const [key, value] of next.entries()) {
        next.set(key, { ...value, selected: false });
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (!recommendations) return;

    const applySelections: ApplySelection[] = recommendations.categories
      .filter((category) => category.recommendedBudget !== null)
      .map((category) => {
        const selection = selections.get(category.categoryId);
        return {
          categoryId: category.categoryId,
          recommendedBudget: category.recommendedBudget!,
          editedBudget: selection?.editedBudget ?? undefined,
          apply: selection?.selected ?? false,
        };
      });

    await applyMutation.mutateAsync({
      month,
      runId: recommendations.runId,
      selections: applySelections,
    });

    onClose();
  };

  const branches = useMemo(() => {
    if (!recommendations) return [];

    const categoriesById = new Map(
      recommendations.categories.map((category) => [category.categoryId, category])
    );

    return recommendations.branches
      .map((branch) => ({
        ...branch,
        categories: branch.recommendedCategoryIds
          .map((categoryId) => categoriesById.get(categoryId))
          .filter((category): category is CategoryRecommendation => !!category),
      }))
      .filter((branch) => branch.categories.length > 0)
      .sort((a, b) => b.historicalAverage - a.historicalAverage);
  }, [recommendations]);

  const groupedBranches = useMemo(() => {
    const ready: typeof branches = [];
    const manual: typeof branches = [];

    for (const branch of branches) {
      if (branch.categories.some((category) => needsManualAttention(category))) {
        manual.push(branch);
      } else {
        ready.push(branch);
      }
    }

    return { ready, manual };
  }, [branches]);

  const selectedCount = useMemo(() => {
    let count = 0;
    for (const value of selections.values()) {
      if (value.selected) count++;
    }
    return count;
  }, [selections]);

  const totalSelectedBudget = useMemo(() => {
    if (!recommendations) return 0;
    let total = 0;
    for (const category of recommendations.categories) {
      const selection = selections.get(category.categoryId);
      if (selection?.selected && category.recommendedBudget !== null) {
        total += selection.editedBudget ?? category.recommendedBudget;
      }
    }
    return total;
  }, [recommendations, selections]);

  const planStats = useMemo(() => {
    if (!recommendations) return null;

    const recommendationLines = recommendations.categories.filter(
      (category) => category.recommendedBudget !== null
    ).length;
    const selectedRecommendedLines = recommendations.categories.filter((category) => {
      const selection = selections.get(category.categoryId);
      return selection?.selected && category.recommendedBudget !== null;
    }).length;
    const childBranches = recommendations.branches.filter((branch) => branch.budgetLevel === "child").length;
    const fitsTarget = totalSelectedBudget <= recommendations.summary.targetFlexibleBudget;
    const topBranches = [...recommendations.branches]
      .sort((a, b) => b.historicalAverage - a.historicalAverage)
      .slice(0, 3);
    const selectedGap = recommendations.summary.targetFlexibleBudget - totalSelectedBudget;

    return {
      recommendationLines,
      selectedRecommendedLines,
      branchCount: recommendations.branches.length,
      childBranches,
      fitsTarget,
      topBranches,
      manualAttentionBranches: groupedBranches.manual.length,
      uncoveredCount: recommendations.uncoveredHighSpend.length,
      selectedGap,
    };
  }, [recommendations, selections, totalSelectedBudget, groupedBranches.manual.length]);

  if (!recommendations && !generateMutation.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            AI Budget Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Get personalized budget recommendations based on your last 4 months of spending.
            Recommendations stay grounded in your actual behavior and keep each branch at one clean budgeting level.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleGenerate}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Recommendations
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (generateMutation.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Analyzing Spending History...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (generateMutation.isError) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Failed to Generate Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {generateMutation.error instanceof Error
              ? generateMutation.error.message
              : "An unexpected error occurred"}
          </p>
          <div className="flex gap-2">
            <Button onClick={handleGenerate}>Try Again</Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!recommendations) return null;

  const { summary, diagnostics } = recommendations;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {recommendations.source === "ai" ? (
              <Sparkles className="h-4 w-4 text-primary" />
            ) : (
              <Calculator className="h-4 w-4 text-muted-foreground" />
            )}
            Budget Recommendations
            <Badge variant="outline" className="ml-2">
              {recommendations.source === "ai" ? "AI-assisted" : "Based on history"}
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {planStats && (
          <div className="space-y-3 rounded-lg bg-muted/50 p-4">
            <div className="flex items-baseline gap-6">
              <div>
                <span className="text-2xl font-bold">{formatCurrency(totalSelectedBudget)}</span>
                <span className="ml-2 text-sm text-muted-foreground">selected so far</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">of </span>
                <span className="font-medium">{formatCurrency(summary.targetFlexibleBudget)}</span>
                <span className="text-muted-foreground"> target flexible budget</span>
              </div>
              {planStats.fitsTarget ? (
                <Badge className="border-0 bg-green-100 text-green-700">
                  <Check className="mr-1 h-3 w-3" />
                  Within target
                </Badge>
              ) : (
                <Badge className="border-0 bg-amber-100 text-amber-700">
                  Over target
                </Badge>
              )}
            </div>

            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{planStats.selectedRecommendedLines}</span> selected lines so far
                from <span className="font-medium text-foreground">{planStats.recommendationLines}</span> suggested lines
                across <span className="font-medium text-foreground">{planStats.branchCount}</span> branches
                {planStats.childBranches > 0 && (
                  <span> · <span className="font-medium text-foreground">{planStats.childBranches}</span> preserving manual child splits</span>
                )}
              </p>
              <p className="text-amber-700">
                This is a starting point, not a finished budget.
                {planStats.manualAttentionBranches > 0 && (
                  <span> You still need to review <span className="font-medium text-foreground">{planStats.manualAttentionBranches}</span> branches manually.</span>
                )}
              </p>
              {planStats.selectedGap > 0 && (
                <p>
                  Current selected recommendations leave <span className="font-medium text-foreground">{formatCurrency(planStats.selectedGap)}</span> unallocated.
                </p>
              )}
              {planStats.selectedGap < 0 && (
                <p className="text-amber-600">
                  Current selected recommendations are <span className="font-medium text-foreground">{formatCurrency(Math.abs(planStats.selectedGap))}</span> over target.
                </p>
              )}
              {recommendations.trims.length > 0 && recommendations.trims.reduce((sum, t) => sum + t.trimAmount, 0) > 0 && (
                <p>
                  <span className="font-medium text-foreground">{recommendations.trims.length}</span> categories trimmed by{" "}
                  {formatCurrency(recommendations.trims.reduce((sum, t) => sum + t.trimAmount, 0))} total to keep the plan realistic.
                </p>
              )}
              {summary.budgetCoveragePercent === 0 && (
                <p className="text-amber-600">
                  You have not budgeted any of these categories yet, so the panel is intentionally conservative and still needs manual review.
                </p>
              )}
              {planStats.uncoveredCount > 0 && (
                <p>
                  <span className="font-medium text-foreground">{planStats.uncoveredCount}</span> high-spend categories still need manual budgets.
                </p>
              )}
            </div>

            {planStats.topBranches.length > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground">Biggest branches: </span>
                {planStats.topBranches.map((branch, index) => (
                  <span key={branch.branchCategoryId}>
                    {index > 0 && ", "}
                    <span className="font-medium">{branch.branchCategoryName}</span>
                    <span className="text-muted-foreground"> ({formatCurrency(branch.historicalAverage)})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {groupedBranches.manual.length > 0 && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
              <div className="space-y-1">
                <h3 className="font-medium text-amber-900">Needs manual attention</h3>
                <p className="text-sm text-amber-800">
                  These branches have low-data or weak recommendations. Review them manually before treating this as a finished budget.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {groupedBranches.manual.map((branch) => (
                <BranchCard
                  key={branch.branchCategoryId}
                  branch={branch}
                  categories={branch.categories}
                  selections={selections}
                  evidence={evidenceData}
                  manualAttention
                  onToggle={handleToggle}
                  onEditBudget={handleEditBudget}
                  onSelectBranch={() => {
                    setSelections((prev) => {
                      const next = new Map(prev);
                      for (const category of branch.categories) {
                        if (category.recommendedBudget !== null) {
                          const current = next.get(category.categoryId) || { selected: false, editedBudget: null };
                          next.set(category.categoryId, { ...current, selected: true });
                        }
                      }
                      return next;
                    });
                  }}
                  onDeselectBranch={() => {
                    setSelections((prev) => {
                      const next = new Map(prev);
                      for (const category of branch.categories) {
                        const current = next.get(category.categoryId) || { selected: false, editedBudget: null };
                        next.set(category.categoryId, { ...current, selected: false });
                      }
                      return next;
                    });
                  }}
                />
              ))}
            </div>

            {recommendations.uncoveredHighSpend.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-background/80 p-3">
                <p className="mb-2 text-sm font-medium">High-spend categories still needing manual budgets</p>
                <div className="flex flex-wrap gap-2">
                  {recommendations.uncoveredHighSpend.map((category) => (
                    <Badge key={category.categoryId} variant="outline" className="bg-background">
                      {category.categoryName} {formatCurrency(category.historicalAverage)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {groupedBranches.ready.length > 0 && (
          <div className="space-y-3">
            <div>
              <h3 className="font-medium">Ready to apply</h3>
              <p className="text-sm text-muted-foreground">
                These branches have stronger recommendations and can usually be accepted with only light editing.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {groupedBranches.ready.map((branch) => (
                <BranchCard
                  key={branch.branchCategoryId}
                  branch={branch}
                  categories={branch.categories}
                  selections={selections}
                  evidence={evidenceData}
                  onToggle={handleToggle}
                  onEditBudget={handleEditBudget}
                  onSelectBranch={() => {
                    setSelections((prev) => {
                      const next = new Map(prev);
                      for (const category of branch.categories) {
                        if (category.recommendedBudget !== null) {
                          const current = next.get(category.categoryId) || { selected: false, editedBudget: null };
                          next.set(category.categoryId, { ...current, selected: true });
                        }
                      }
                      return next;
                    });
                  }}
                  onDeselectBranch={() => {
                    setSelections((prev) => {
                      const next = new Map(prev);
                      for (const category of branch.categories) {
                        const current = next.get(category.categoryId) || { selected: false, editedBudget: null };
                        next.set(category.categoryId, { ...current, selected: false });
                      }
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {(diagnostics.multiCategorySpend > 0 || diagnostics.categoriesWithInsufficientData > 0) && (
          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {diagnostics.multiCategorySpend > 0 && (
              <p>
                {formatCurrency(diagnostics.multiCategorySpend)} excluded from analysis because the transactions had multiple unrelated categories.
              </p>
            )}
            {diagnostics.categoriesWithInsufficientData > 0 && (
              <p>
                {diagnostics.categoriesWithInsufficientData} recommendation lines have limited history and should be treated as low-confidence.
              </p>
            )}
          </div>
        )}

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                Deselect All
              </Button>
            </div>
            <div className="text-muted-foreground">
              {selectedCount} selected • {formatCurrency(totalSelectedBudget)} total
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleApply}
              disabled={selectedCount === 0 || applyMutation.isPending}
              className="flex-1"
            >
              {applyMutation.isPending ? "Applying..." : `Apply ${selectedCount} Budgets`}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

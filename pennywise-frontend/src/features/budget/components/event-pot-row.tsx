import type { BudgetEventPot } from "@/shared/lib/api";
import { formatCurrency } from "@/features/budget/lib/cycle";

interface EventPotRowProps {
  pot: BudgetEventPot;
}

/** Planning-side pot row. No spend tracking — that lives on Overview. */
export function EventPotRow({ pot }: EventPotRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="font-medium truncate min-w-0">
        {pot.name}
        {pot.category && (
          <span className="text-xs text-muted-foreground ml-1.5">
            · {pot.category.name}
          </span>
        )}
      </span>
      <span className="tabular-nums shrink-0">{formatCurrency(parseFloat(pot.amount))}</span>
    </div>
  );
}

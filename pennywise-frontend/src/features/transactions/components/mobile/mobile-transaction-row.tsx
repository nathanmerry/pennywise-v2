import type { Transaction } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { formatAmount } from "../../lib/group-transactions";

export type MobileTxAction =
  | "category"
  | "note"
  | "date"
  | "amount"
  | "ignore"
  | "rule";

interface Props {
  tx: Transaction;
  onTap?: (tx: Transaction) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function MobileTransactionRow({
  tx,
  onTap,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: Props) {
  const name = tx.merchantName || tx.description || "Unknown transaction";
  const amount = parseFloat(tx.updatedTransactionAmount ?? tx.amount);
  const isPositive = amount > 0;

  const metaParts: string[] = [];
  if (tx.pending) metaParts.push("Pending");
  if (tx.isIgnored) metaParts.push("Ignored");

  const directCategories = tx.categories.filter((c) => c.source !== "inherited");
  if (directCategories.length > 0) {
    const first = directCategories[0].category?.name;
    if (first) {
      const extra = directCategories.length - 1;
      metaParts.push(extra > 0 ? `${first} +${extra}` : first);
    }
  } else if (!tx.pending && !tx.isIgnored) {
    metaParts.push("Uncategorised");
  }

  const amountEl = (
    <span
      className={cn(
        "shrink-0 text-sm font-medium tabular-nums",
        isPositive && "text-emerald-600 dark:text-emerald-400",
        tx.isIgnored && "line-through",
      )}
    >
      {formatAmount(amount, tx.currency)}
    </span>
  );

  const metaEl = (
    <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
      {metaParts.join(" · ")}
    </div>
  );

  if (selectMode) {
    return (
      <div
        onClick={() => onToggleSelect?.(tx.id)}
        className={cn(
          "flex cursor-pointer items-center gap-3 py-2.5 transition-colors active:bg-accent/40",
          tx.isIgnored && "opacity-60",
          selected && "bg-accent/30",
        )}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect?.(tx.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${name}`}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          {metaEl}
        </div>
        {amountEl}
      </div>
    );
  }

  return (
    <div
      onClick={onTap ? () => onTap(tx) : undefined}
      className={cn(
        "py-2.5",
        tx.isIgnored && "opacity-60",
        onTap && "cursor-pointer transition-colors active:bg-accent/30",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {name}
        </span>
        {amountEl}
      </div>
      {metaEl}
    </div>
  );
}

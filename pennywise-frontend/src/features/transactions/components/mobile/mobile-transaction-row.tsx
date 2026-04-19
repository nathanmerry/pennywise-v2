import {
  CalendarIcon,
  Eye,
  EyeOff,
  ListFilter,
  MoreVertical,
  StickyNote,
  Tag,
} from "lucide-react";
import type { Transaction } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { formatAmount } from "../../lib/group-transactions";

export type MobileTxAction =
  | "category"
  | "note"
  | "date"
  | "ignore"
  | "rule";

interface Props {
  tx: Transaction;
  onAction: (action: MobileTxAction, tx: Transaction) => void;
}

export function MobileTransactionRow({ tx, onAction }: Props) {
  const name = tx.merchantName || tx.description || "Unknown transaction";
  const amount = parseFloat(tx.amount);
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-2.5",
        tx.isIgnored && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {name}
          </span>
          <span
            className={cn(
              "shrink-0 text-sm font-medium tabular-nums",
              isPositive && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {formatAmount(amount, tx.currency)}
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
          {metaParts.join(" · ")}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Transaction actions"
            onClick={(e) => e.stopPropagation()}
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => onAction("category", tx)}>
            <Tag className="mr-2 h-4 w-4" />
            Edit category
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction("note", tx)}>
            <StickyNote className="mr-2 h-4 w-4" />
            {tx.note ? "Edit note" : "Add note"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction("date", tx)}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            Edit date
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction("ignore", tx)}>
            {tx.isIgnored ? (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Unignore
              </>
            ) : (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                Ignore
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onAction("rule", tx)}>
            <ListFilter className="mr-2 h-4 w-4" />
            Create rule from this
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

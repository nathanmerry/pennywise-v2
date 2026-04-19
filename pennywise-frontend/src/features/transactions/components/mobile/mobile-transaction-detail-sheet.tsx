import { format, parseISO } from "date-fns";
import { ChevronRight, Eye, EyeOff, ListFilter } from "lucide-react";
import type { Transaction } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { formatAmount } from "../../lib/group-transactions";
import type { MobileTxAction } from "./mobile-transaction-row";

interface Props {
  tx: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: MobileTxAction, tx: Transaction) => void;
}

export function MobileTransactionDetailSheet({
  tx,
  open,
  onOpenChange,
  onAction,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Transaction details</SheetTitle>
        </SheetHeader>
        {tx && <DetailBody tx={tx} onAction={onAction} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  tx,
  onAction,
}: {
  tx: Transaction;
  onAction: (action: MobileTxAction, tx: Transaction) => void;
}) {
  const name = tx.merchantName || tx.description || "Unknown transaction";
  const amount = parseFloat(tx.amount);
  const isPositive = amount > 0;

  const directCategories = tx.categories.filter(
    (c) => c.source !== "inherited",
  );
  const categoryLabels = directCategories
    .map((c) => {
      const parent = tx.categories.find(
        (p) => p.categoryId === c.category.parentId && p.source === "inherited",
      );
      return parent
        ? `${parent.category.name} / ${c.category.name}`
        : c.category.name;
    })
    .join(", ");

  const statusParts: string[] = [];
  if (tx.pending) statusParts.push("Pending");
  if (tx.isIgnored) statusParts.push("Ignored");

  let formattedDate = tx.transactionDate;
  try {
    formattedDate = format(parseISO(tx.transactionDate), "EEEE d MMMM yyyy");
  } catch {
    // fall back to raw string
  }

  return (
    <div className="px-4">
      <div className="pb-3 pt-1">
        {tx.merchantName && tx.description && tx.description !== tx.merchantName && (
          <div className="truncate text-xs uppercase tracking-wide text-muted-foreground">
            {tx.description}
          </div>
        )}
        <div className="mt-0.5 text-lg font-semibold leading-tight">
          {name}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div
            className={cn(
              "text-3xl font-semibold tabular-nums leading-none",
              isPositive && "text-emerald-600 dark:text-emerald-400",
              tx.isIgnored && "line-through",
            )}
          >
            {formatAmount(amount, tx.currency)}
          </div>
          {statusParts.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {statusParts.join(" · ")}
            </div>
          )}
        </div>
      </div>

      <div className="-mx-4 border-t">
        <Field
          label="Category"
          value={categoryLabels || "Uncategorised"}
          muted={!categoryLabels}
          onClick={() => onAction("category", tx)}
        />
        <Field
          label="Note"
          value={tx.note || "Add a note"}
          muted={!tx.note}
          onClick={() => onAction("note", tx)}
        />
        <Field
          label="Date"
          value={formattedDate}
          onClick={() => onAction("date", tx)}
        />
        <Field
          label="Account"
          value={`${tx.account.connection.institutionName} · ${tx.account.accountName}`}
        />
      </div>

      <div className="-mx-4 border-t py-1">
        <ActionRow
          icon={ListFilter}
          label="Create rule from this"
          onClick={() => onAction("rule", tx)}
        />
        <ActionRow
          icon={tx.isIgnored ? Eye : EyeOff}
          label={tx.isIgnored ? "Unignore" : "Ignore"}
          onClick={() => onAction("ignore", tx)}
          muted
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  muted,
  onClick,
}: {
  label: string;
  value: string;
  muted?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-0.5 truncate text-sm",
            muted && "text-muted-foreground",
          )}
        >
          {value}
        </div>
      </div>
      {onClick && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left transition-colors active:bg-accent/40"
      >
        {content}
      </button>
    );
  }

  return content;
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors active:bg-accent/40",
        muted && "text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </button>
  );
}

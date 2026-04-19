import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Calendar } from "@/shared/components/ui/calendar";
import { cn } from "@/shared/lib/utils";
import type { Account, Category, TransactionFilters } from "@/shared/lib/api";

interface Props {
  filters: TransactionFilters;
  onFiltersChange: (f: TransactionFilters) => void;
  accounts: Account[];
  categories: Category[];
}

type SheetKey = "account" | "category" | "status" | "date";

export function TransactionsFilterChips({
  filters,
  onFiltersChange,
  accounts,
  categories,
}: Props) {
  const [open, setOpen] = useState<SheetKey | null>(null);

  const update = (patch: Partial<TransactionFilters>) =>
    onFiltersChange({ ...filters, ...patch, page: 1 });

  const close = () => setOpen(null);

  const accountLabel = filters.accountId
    ? accounts.find((a) => a.id === filters.accountId)?.accountName ??
      "Account"
    : "All accounts";

  const categoryLabel = (() => {
    if (!filters.categoryId) return "All categories";
    if (filters.categoryId === "uncategorised") return "Uncategorised";
    return (
      categories.find((c) => c.id === filters.categoryId)?.name ?? "Category"
    );
  })();

  const statusLabel =
    filters.isIgnored === "true"
      ? "Ignored"
      : filters.isIgnored === "false"
        ? "Not ignored"
        : "All";

  const dateLabel = chipDateLabel(filters.from, filters.to);

  const topLevel = categories.filter((c) => !c.parentId);

  return (
    <>
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip
          active={!!filters.accountId}
          onClick={() => setOpen("account")}
          label={accountLabel}
        />
        <Chip
          active={!!filters.categoryId}
          onClick={() => setOpen("category")}
          label={categoryLabel}
        />
        <Chip
          active={filters.isIgnored !== undefined}
          onClick={() => setOpen("status")}
          label={statusLabel}
        />
        <Chip
          active={!!filters.from || !!filters.to}
          onClick={() => setOpen("date")}
          label={dateLabel}
        />
      </div>

      <Sheet open={open === "account"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Account</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <OptionRow
              selected={!filters.accountId}
              onClick={() => {
                update({ accountId: undefined });
                close();
              }}
            >
              All accounts
            </OptionRow>
            {accounts.map((a) => (
              <OptionRow
                key={a.id}
                selected={filters.accountId === a.id}
                onClick={() => {
                  update({ accountId: a.id });
                  close();
                }}
              >
                <div className="flex flex-col">
                  <span>{a.accountName}</span>
                  {a.connection?.institutionName && (
                    <span className="text-xs text-muted-foreground">
                      {a.connection.institutionName}
                    </span>
                  )}
                </div>
              </OptionRow>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={open === "category"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Category</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <OptionRow
              selected={!filters.categoryId}
              onClick={() => {
                update({ categoryId: undefined });
                close();
              }}
            >
              All categories
            </OptionRow>
            <OptionRow
              selected={filters.categoryId === "uncategorised"}
              onClick={() => {
                update({ categoryId: "uncategorised" });
                close();
              }}
            >
              Uncategorised
            </OptionRow>
            {topLevel.map((parent) => {
              const children = categories.filter(
                (c) => c.parentId === parent.id,
              );
              return (
                <div key={parent.id}>
                  <OptionRow
                    selected={filters.categoryId === parent.id}
                    onClick={() => {
                      update({ categoryId: parent.id });
                      close();
                    }}
                  >
                    {parent.name}
                  </OptionRow>
                  {children.map((child) => (
                    <OptionRow
                      key={child.id}
                      selected={filters.categoryId === child.id}
                      onClick={() => {
                        update({ categoryId: child.id });
                        close();
                      }}
                      indent
                    >
                      {child.name}
                    </OptionRow>
                  ))}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={open === "status"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Status</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <OptionRow
              selected={filters.isIgnored === undefined}
              onClick={() => {
                update({ isIgnored: undefined });
                close();
              }}
            >
              All
            </OptionRow>
            <OptionRow
              selected={filters.isIgnored === "false"}
              onClick={() => {
                update({ isIgnored: "false" });
                close();
              }}
            >
              Not ignored
            </OptionRow>
            <OptionRow
              selected={filters.isIgnored === "true"}
              onClick={() => {
                update({ isIgnored: "true" });
                close();
              }}
            >
              Ignored
            </OptionRow>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={open === "date"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="max-h-[90vh]">
          <SheetHeader>
            <SheetTitle>Date range</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center gap-3 px-4 pb-6">
            <Calendar
              mode="range"
              selected={{
                from: filters.from ? parseISO(filters.from) : undefined,
                to: filters.to ? parseISO(filters.to) : undefined,
              }}
              onSelect={(range) => {
                update({
                  from: range?.from
                    ? format(range.from, "yyyy-MM-dd")
                    : undefined,
                  to: range?.to ? format(range.to, "yyyy-MM-dd") : undefined,
                });
              }}
              numberOfMonths={1}
            />
            <div className="flex w-full items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  update({ from: undefined, to: undefined });
                }}
                disabled={!filters.from && !filters.to}
              >
                Clear
              </Button>
              <Button size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      <span className="max-w-[160px] truncate">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </button>
  );
}

function OptionRow({
  selected,
  onClick,
  indent,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  indent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between border-b border-border/60 py-3 text-left text-sm last:border-0 active:bg-accent/50",
        indent && "pl-6",
      )}
    >
      <span className={cn(selected && "font-medium")}>{children}</span>
      {selected && (
        <span className="ml-3 h-2 w-2 shrink-0 rounded-full bg-foreground" />
      )}
    </button>
  );
}

function chipDateLabel(from?: string, to?: string): string {
  if (!from && !to) return "Date";
  const f = from ? parseISO(from) : undefined;
  const t = to ? parseISO(to) : undefined;
  if (f && t) {
    const sameYear = f.getFullYear() === t.getFullYear();
    const sameMonth = sameYear && f.getMonth() === t.getMonth();
    if (sameMonth) {
      return `${format(f, "MMMM do")} – ${format(t, "do")}`;
    }
    if (sameYear) {
      return `${format(f, "MMM do")} – ${format(t, "MMM do")}`;
    }
    return `${format(f, "MMM do, yyyy")} – ${format(t, "MMM do, yyyy")}`;
  }
  if (f) return `Since ${format(f, "MMM do")}`;
  if (t) return `Until ${format(t, "MMM do")}`;
  return "Date";
}

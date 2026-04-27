import { useState } from "react";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  StickyNote,
  Tag,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import type {
  Account,
  Category,
  Transaction,
  TransactionFilters,
} from "@/shared/lib/api";
import { useBulkUpdateTransactions } from "../../hooks/use-transactions";
import { formatDateRangeLabel } from "../../lib/group-transactions";
import { GroupedTransactionsFeed } from "./grouped-transactions-feed";
import { MobileMonthSummary } from "./mobile-month-summary";
import { MobileTransactionDetailSheet } from "./mobile-transaction-detail-sheet";
import { TransactionsFilterChips } from "./transactions-filter-chips";
import { TransactionsSearchBar } from "./transactions-search-bar";
import { TransactionsSummary } from "./transactions-summary";
import type { MobileTxAction } from "./mobile-transaction-row";
import { EditNoteDialog } from "../edit-note-dialog";
import { EditCategoryDialog } from "../edit-category-dialog";
import { EditDateDialog } from "../edit-date-dialog";
import { EditAmountDialog } from "../edit-amount-dialog";
import { CreateRuleDialog } from "../create-rule-dialog";
import { BulkNoteDialog } from "../bulk-note-dialog";
import { BulkCategoryDialog } from "../bulk-category-dialog";
import { BulkDateDialog } from "../bulk-date-dialog";

export interface MobileTxUpdatePayload {
  note?: string | null;
  categoryIds?: string[] | null;
  isIgnored?: boolean;
  transactionDate?: string;
  updatedTransactionAmount?: number | null;
}

interface Props {
  filters: TransactionFilters;
  onFiltersChange: (f: TransactionFilters) => void;
  transactions: Transaction[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  isLoading: boolean;
  categories: Category[];
  accounts: Account[];
  onUpdate: (id: string, data: MobileTxUpdatePayload) => void;
}

export function MobileTransactionsPage({
  filters,
  onFiltersChange,
  transactions,
  pagination,
  isLoading,
  categories,
  accounts,
  onUpdate,
}: Props) {
  const [noteTx, setNoteTx] = useState<Transaction | null>(null);
  const [categoryTx, setCategoryTx] = useState<Transaction | null>(null);
  const [dateTx, setDateTx] = useState<Transaction | null>(null);
  const [amountTx, setAmountTx] = useState<Transaction | null>(null);
  const [ruleTx, setRuleTx] = useState<Transaction | null>(null);
  // Detail sheet holds an id so edits/invalidations flow through to a live tx.
  const [detailTxId, setDetailTxId] = useState<string | null>(null);
  const detailTx = detailTxId
    ? (transactions.find((t) => t.id === detailTxId) ?? null)
    : null;

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkNoteOpen, setBulkNoteOpen] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkDateOpen, setBulkDateOpen] = useState(false);

  const bulkUpdate = useBulkUpdateTransactions();

  const dateLabel = formatDateRangeLabel(filters.from, filters.to);
  const hasFilters =
    !!filters.accountId ||
    !!filters.categoryId ||
    filters.isIgnored !== undefined ||
    !!filters.from ||
    !!filters.to ||
    !!filters.search;

  const resetFilters = () =>
    onFiltersChange({ page: 1, limit: filters.limit ?? 50 });

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedArray = Array.from(selectedIds);
  const selectedTxs = transactions.filter((tx) => selectedIds.has(tx.id));
  const allIgnored =
    selectedTxs.length > 0 && selectedTxs.every((tx) => tx.isIgnored);

  const runBulk = (data: MobileTxUpdatePayload) => {
    if (selectedArray.length === 0) return;
    bulkUpdate.mutate(
      { ids: selectedArray, data },
      { onSuccess: exitSelect },
    );
  };

  const handleAction = (action: MobileTxAction, tx: Transaction) => {
    switch (action) {
      case "category":
        setCategoryTx(tx);
        break;
      case "note":
        setNoteTx(tx);
        break;
      case "date":
        setDateTx(tx);
        break;
      case "amount":
        setAmountTx(tx);
        break;
      case "ignore":
        onUpdate(tx.id, { isIgnored: !tx.isIgnored });
        break;
      case "rule":
        setRuleTx(tx);
        break;
    }
  };

  const showBulkBar = selectMode && selectedArray.length > 0;

  return (
    <div
      className={cn(
        "space-y-4",
        selectMode && "pt-16",
        showBulkBar && "pb-24",
      )}
    >
      {selectMode && (
        <div className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-2 border-b bg-card px-3">
          <Button variant="ghost" size="sm" onClick={exitSelect}>
            Cancel
          </Button>
          <span className="text-sm font-medium">
            {selectedArray.length === 0
              ? "Select items"
              : `${selectedArray.length} selected`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={selectedArray.length === 0 || bulkUpdate.isPending}
            onClick={() => runBulk({ isIgnored: !allIgnored })}
          >
            {allIgnored ? "Unignore" : "Ignore"}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <TransactionsSummary count={pagination?.total} dateLabel={dateLabel} />
        {!selectMode && transactions.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="text-sm font-medium text-foreground hover:opacity-70"
          >
            Select
          </button>
        )}
      </div>

      {!selectMode && <MobileMonthSummary filters={filters} />}

      {!selectMode && (
        <div className="space-y-3">
          <TransactionsSearchBar
            value={filters.search ?? ""}
            onChange={(search) =>
              onFiltersChange({
                ...filters,
                search: search || undefined,
                page: 1,
              })
            }
          />
          <TransactionsFilterChips
            filters={filters}
            onFiltersChange={onFiltersChange}
            accounts={accounts}
            categories={categories}
          />
        </div>
      )}

      {isLoading ? (
        <FeedSkeleton />
      ) : transactions.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onReset={resetFilters} />
      ) : (
        <>
          <GroupedTransactionsFeed
            transactions={transactions}
            onTap={(tx) => setDetailTxId(tx.id)}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />

          {pagination && pagination.totalPages > 1 && !selectMode && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() =>
                  onFiltersChange({ ...filters, page: pagination.page - 1 })
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  onFiltersChange({ ...filters, page: pagination.page + 1 })
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {showBulkBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-4">
            <BulkBarBtn
              icon={allIgnored ? Eye : EyeOff}
              label={allIgnored ? "Unignore" : "Ignore"}
              disabled={bulkUpdate.isPending}
              onClick={() => runBulk({ isIgnored: !allIgnored })}
            />
            <BulkBarBtn
              icon={Tag}
              label="Category"
              disabled={bulkUpdate.isPending}
              onClick={() => setBulkCategoryOpen(true)}
            />
            <BulkBarBtn
              icon={StickyNote}
              label="Note"
              disabled={bulkUpdate.isPending}
              onClick={() => setBulkNoteOpen(true)}
            />
            <BulkBarBtn
              icon={CalendarIcon}
              label="Date"
              disabled={bulkUpdate.isPending}
              onClick={() => setBulkDateOpen(true)}
            />
          </div>
        </div>
      )}

      <MobileTransactionDetailSheet
        tx={detailTx}
        open={!!detailTx}
        onOpenChange={(open) => !open && setDetailTxId(null)}
        onAction={handleAction}
      />

      {/* Single-transaction dialogs */}
      {noteTx && (
        <EditNoteDialog
          transaction={noteTx}
          open={!!noteTx}
          onOpenChange={(open: boolean) => !open && setNoteTx(null)}
          onSave={(note: string) => {
            onUpdate(noteTx.id, { note: note || null });
            setNoteTx(null);
          }}
        />
      )}

      {categoryTx && (
        <EditCategoryDialog
          transaction={categoryTx}
          categories={categories}
          open={!!categoryTx}
          onOpenChange={(open: boolean) => !open && setCategoryTx(null)}
          onSave={(categoryIds: string[]) => {
            onUpdate(categoryTx.id, {
              categoryIds: categoryIds.length > 0 ? categoryIds : null,
            });
            setCategoryTx(null);
          }}
        />
      )}

      {dateTx && (
        <EditDateDialog
          transaction={dateTx}
          open={!!dateTx}
          onOpenChange={(open: boolean) => !open && setDateTx(null)}
          onSave={(date: string) => {
            onUpdate(dateTx.id, { transactionDate: date });
            setDateTx(null);
          }}
        />
      )}

      {amountTx && (
        <EditAmountDialog
          transaction={amountTx}
          open={!!amountTx}
          onOpenChange={(open: boolean) => !open && setAmountTx(null)}
          onSave={(amount: number | null) => {
            onUpdate(amountTx.id, { updatedTransactionAmount: amount });
            setAmountTx(null);
          }}
        />
      )}

      {ruleTx && (
        <CreateRuleDialog
          transaction={ruleTx}
          categories={categories}
          open={!!ruleTx}
          onOpenChange={(open: boolean) => !open && setRuleTx(null)}
        />
      )}

      {/* Bulk dialogs */}
      <BulkNoteDialog
        count={selectedArray.length}
        open={bulkNoteOpen}
        onOpenChange={setBulkNoteOpen}
        onSave={(note) => {
          runBulk({ note });
          setBulkNoteOpen(false);
        }}
      />

      <BulkCategoryDialog
        count={selectedArray.length}
        categories={categories}
        open={bulkCategoryOpen}
        onOpenChange={setBulkCategoryOpen}
        onSave={(categoryIds) => {
          runBulk({ categoryIds });
          setBulkCategoryOpen(false);
        }}
      />

      <BulkDateDialog
        count={selectedArray.length}
        open={bulkDateOpen}
        onOpenChange={setBulkDateOpen}
        onSave={(date) => {
          runBulk({ transactionDate: date });
          setBulkDateOpen(false);
        }}
      />
    </div>
  );
}

function BulkBarBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1 py-3 text-xs text-foreground transition-colors active:bg-accent/50 disabled:opacity-50"
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="flex items-baseline justify-between pb-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="divide-y divide-border/60">
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-4 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="font-medium">No transactions found</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilters
          ? "Try changing your search or filters."
          : "Nothing to show yet."}
      </p>
      {hasFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          className="mt-4"
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

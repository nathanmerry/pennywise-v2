import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type {
  Account,
  Category,
  Transaction,
  TransactionFilters,
} from "@/shared/lib/api";
import { formatDateRangeLabel } from "../../lib/group-transactions";
import { GroupedTransactionsFeed } from "./grouped-transactions-feed";
import { TransactionsFilterChips } from "./transactions-filter-chips";
import { TransactionsSearchBar } from "./transactions-search-bar";
import { TransactionsSummary } from "./transactions-summary";
import type { MobileTxAction } from "./mobile-transaction-row";
import { EditNoteDialog } from "../edit-note-dialog";
import { EditCategoryDialog } from "../edit-category-dialog";
import { EditDateDialog } from "../edit-date-dialog";
import { CreateRuleDialog } from "../create-rule-dialog";

export interface MobileTxUpdatePayload {
  note?: string | null;
  categoryIds?: string[] | null;
  isIgnored?: boolean;
  transactionDate?: string;
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
  const [ruleTx, setRuleTx] = useState<Transaction | null>(null);

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
      case "ignore":
        onUpdate(tx.id, { isIgnored: !tx.isIgnored });
        break;
      case "rule":
        setRuleTx(tx);
        break;
    }
  };

  return (
    <div className="space-y-4">
      <TransactionsSummary count={pagination?.total} dateLabel={dateLabel} />

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

      {isLoading ? (
        <FeedSkeleton />
      ) : transactions.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onReset={resetFilters} />
      ) : (
        <>
          <GroupedTransactionsFeed
            transactions={transactions}
            onAction={handleAction}
          />

          {pagination && pagination.totalPages > 1 && (
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

      {ruleTx && (
        <CreateRuleDialog
          transaction={ruleTx}
          categories={categories}
          open={!!ruleTx}
          onOpenChange={(open: boolean) => !open && setRuleTx(null)}
        />
      )}
    </div>
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
              <div
                key={j}
                className="flex items-center gap-2 py-2.5"
              >
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

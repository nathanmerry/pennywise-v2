import { useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useTransactions, useUpdateTransaction, useBulkUpdateTransactions } from "./hooks/use-transactions";
import { useCategories } from "@/shared/hooks/use-categories";
import { useAccounts } from "@/shared/hooks/use-accounts";
import { useIsMobile } from "@/shared/hooks/use-media-query";
import { TransactionFilterBar } from "./components/transaction-filters";
import { TransactionTable } from "./components/transaction-table";
import { BulkNoteDialog } from "./components/bulk-note-dialog";
import { BulkCategoryDialog } from "./components/bulk-category-dialog";
import { BulkDateDialog } from "./components/bulk-date-dialog";
import { MobileTransactionsPage } from "./components/mobile/mobile-transactions-page";
import { runAiCategorisation, type TransactionFilters, type AiCategorisationResult } from "@/shared/lib/api";
import { useQueryClient } from "@tanstack/react-query";

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    limit: 50,
  });
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<AiCategorisationResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkNoteOpen, setBulkNoteOpen] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkDateOpen, setBulkDateOpen] = useState(false);
  const [pendingBulkIds, setPendingBulkIds] = useState<string[]>([]);

  const queryClient = useQueryClient();
  const { data, isLoading } = useTransactions(filters);
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const updateTx = useUpdateTransaction();
  const bulkUpdateTx = useBulkUpdateTransactions();
  const isMobile = useIsMobile();

  const pagination = data?.pagination;

  const handleAiCategorise = async () => {
    setAiRunning(true);
    setAiResult(null);
    try {
      const result = await runAiCategorisation({ limit: 100, minConfidence: 0.85 });
      setAiResult(result);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    } catch (err) {
      console.error("AI categorisation failed:", err);
      setAiResult(null);
    } finally {
      setAiRunning(false);
    }
  };

  if (isMobile) {
    return (
      <MobileTransactionsPage
        filters={filters}
        onFiltersChange={setFilters}
        transactions={data?.data ?? []}
        pagination={pagination}
        isLoading={isLoading}
        categories={categories}
        accounts={accounts}
        onUpdate={(id, data) => updateTx.mutate({ id, data })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Transactions</h1>
          {pagination && (
            <span className="text-sm text-muted-foreground">
              {pagination.total.toLocaleString()} transactions
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {aiResult && (
            <span className="text-sm text-muted-foreground">
              {aiResult.transactionsCategorised} categorised
              {aiResult.categoriesCreated > 0 && `, ${aiResult.categoriesCreated} new categories`}
            </span>
          )}
          <Button
            onClick={handleAiCategorise}
            disabled={aiRunning}
            variant="outline"
            size="sm"
          >
            {aiRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Categorising...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                AI Categorise
              </>
            )}
          </Button>
        </div>
      </div>

      <TransactionFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        accounts={accounts}
        categories={categories}
      />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading transactions...
        </div>
      ) : (
        <>
          <TransactionTable
            transactions={data?.data || []}
            categories={categories}
            onUpdate={(id, data) => updateTx.mutate({ id, data })}
            isUpdating={updateTx.isPending}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onBulkAction={handleBulkAction}
            isBulkUpdating={bulkUpdateTx.isPending}
          />

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <BulkNoteDialog
        count={pendingBulkIds.length}
        open={bulkNoteOpen}
        onOpenChange={setBulkNoteOpen}
        onSave={(note) => {
          bulkUpdateTx.mutate(
            { ids: pendingBulkIds, data: { note } },
            {
              onSuccess: () => {
                setBulkNoteOpen(false);
                setSelectedIds(new Set());
                queryClient.invalidateQueries({ queryKey: ["transactions"] });
              },
            }
          );
        }}
      />

      <BulkCategoryDialog
        count={pendingBulkIds.length}
        categories={categories}
        open={bulkCategoryOpen}
        onOpenChange={setBulkCategoryOpen}
        onSave={(categoryIds) => {
          bulkUpdateTx.mutate(
            { ids: pendingBulkIds, data: { categoryIds } },
            {
              onSuccess: () => {
                setBulkCategoryOpen(false);
                setSelectedIds(new Set());
                queryClient.invalidateQueries({ queryKey: ["transactions"] });
              },
            }
          );
        }}
      />

      <BulkDateDialog
        count={pendingBulkIds.length}
        open={bulkDateOpen}
        onOpenChange={setBulkDateOpen}
        onSave={(date) => {
          bulkUpdateTx.mutate(
            { ids: pendingBulkIds, data: { transactionDate: date } },
            {
              onSuccess: () => {
                setBulkDateOpen(false);
                setSelectedIds(new Set());
                queryClient.invalidateQueries({ queryKey: ["transactions"] });
              },
            }
          );
        }}
      />
    </div>
  );

  function handleBulkAction(action: "ignore" | "unignore" | "note" | "category" | "date", ids: string[]) {
    setPendingBulkIds(ids);

    if (action === "ignore") {
      bulkUpdateTx.mutate(
        { ids, data: { isIgnored: true } },
        {
          onSuccess: () => {
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
          },
        }
      );
    } else if (action === "unignore") {
      bulkUpdateTx.mutate(
        { ids, data: { isIgnored: false } },
        {
          onSuccess: () => {
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
          },
        }
      );
    } else if (action === "note") {
      setBulkNoteOpen(true);
    } else if (action === "category") {
      setBulkCategoryOpen(true);
    } else if (action === "date") {
      setBulkDateOpen(true);
    }
  }
}

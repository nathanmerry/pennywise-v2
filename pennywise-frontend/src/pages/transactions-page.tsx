import { useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransactions, useUpdateTransaction } from "../hooks/use-transactions";
import { useCategories } from "../hooks/use-categories";
import { useAccounts } from "../hooks/use-accounts";
import { TransactionFilterBar } from "../components/transactions/transaction-filters";
import { TransactionTable } from "../components/transactions/transaction-table";
import { runAiCategorisation, type TransactionFilters, type AiCategorisationResult } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    limit: 50,
  });
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<AiCategorisationResult | null>(null);

  const queryClient = useQueryClient();
  const { data, isLoading } = useTransactions(filters);
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const updateTx = useUpdateTransaction();

  const pagination = data?.pagination;

  const handleAiCategorise = async () => {
    setAiRunning(true);
    setAiResult(null);
    try {
      const result = await runAiCategorisation({ limit: 100, minConfidence: 0.85 });
      setAiResult(result);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    } catch (err) {
      console.error("AI categorisation failed:", err);
      setAiResult(null);
    } finally {
      setAiRunning(false);
    }
  };

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
    </div>
  );
}

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransactions, useUpdateTransaction } from "../hooks/use-transactions";
import { useCategories } from "../hooks/use-categories";
import { useAccounts } from "../hooks/use-accounts";
import { TransactionFilterBar } from "../components/transactions/transaction-filters";
import { TransactionTable } from "../components/transactions/transaction-table";
import type { TransactionFilters } from "../lib/api";

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    limit: 50,
  });

  const { data, isLoading } = useTransactions(filters);
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const updateTx = useUpdateTransaction();

  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        {pagination && (
          <span className="text-sm text-muted-foreground">
            {pagination.total.toLocaleString()} transactions
          </span>
        )}
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
            onUpdate={(id, updateData) => updateTx.mutate({ id, data: updateData })}
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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchTransactions,
  updateTransaction,
  bulkUpdateTransactions,
  createTransaction,
  type TransactionFilters,
} from "@/shared/lib/api";

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => fetchTransactions(filters),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { note?: string | null; categoryIds?: string[] | null; isIgnored?: boolean; transactionDate?: string; updatedTransactionAmount?: number | null };
    }) => updateTransaction(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      // A manual transaction shifts spend totals, so refresh the budget/spend views too.
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["currentBudgetOverview"] });
      qc.invalidateQueries({ queryKey: ["budgetOverview"] });
      qc.invalidateQueries({ queryKey: ["spendingBreakdown"] });
    },
  });
}

export function useBulkUpdateTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      data,
    }: {
      ids: string[];
      data: { note?: string | null; categoryIds?: string[] | null; isIgnored?: boolean; transactionDate?: string };
    }) => bulkUpdateTransactions(ids, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

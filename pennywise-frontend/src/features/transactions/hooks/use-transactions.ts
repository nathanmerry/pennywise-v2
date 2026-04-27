import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchTransactions,
  updateTransaction,
  bulkUpdateTransactions,
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

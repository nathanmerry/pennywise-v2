import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchRules,
  createRule,
  updateRule,
  deleteRule,
  applyRule,
} from "@/shared/lib/api";

export function useRules() {
  return useQuery({
    queryKey: ["rules"],
    queryFn: fetchRules,
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateRule>[1] }) =>
      updateRule(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
}

export function useApplyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: applyRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

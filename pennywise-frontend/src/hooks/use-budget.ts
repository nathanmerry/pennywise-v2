import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBudgetGroups,
  createBudgetGroup,
  updateBudgetGroup,
  deleteBudgetGroup,
  fetchBudgetMonths,
  fetchBudgetMonth,
  createBudgetMonth,
  updateBudgetMonth,
  deleteBudgetMonth,
  createFixedCommitment,
  updateFixedCommitment,
  deleteFixedCommitment,
  createPlannedSpend,
  updatePlannedSpend,
  deletePlannedSpend,
  createCategoryPlan,
  updateCategoryPlan,
  deleteCategoryPlan,
  fetchBudgetOverview,
  fetchCurrentBudgetOverview,
  fetchSpendingBreakdown,
  fetchOverspendCategories,
  fetchMonthlyPace,
  fetchCategoryPressureDetail,
} from "@/lib/api";

// Budget Groups
export function useBudgetGroups() {
  return useQuery({ queryKey: ["budgetGroups"], queryFn: fetchBudgetGroups });
}

export function useCreateBudgetGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBudgetGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgetGroups"] }),
  });
}

export function useUpdateBudgetGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBudgetGroup>[1] }) =>
      updateBudgetGroup(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgetGroups"] }),
  });
}

export function useDeleteBudgetGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteBudgetGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgetGroups"] }),
  });
}

// Budget Months
export function useBudgetMonths() {
  return useQuery({ queryKey: ["budgetMonths"], queryFn: fetchBudgetMonths });
}

export function useBudgetMonth(month: string) {
  return useQuery({
    queryKey: ["budgetMonth", month],
    queryFn: () => fetchBudgetMonth(month),
    enabled: !!month,
  });
}

export function useCreateBudgetMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBudgetMonth,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgetMonths"] }),
  });
}

export function useUpdateBudgetMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, data }: { month: string; data: Parameters<typeof updateBudgetMonth>[1] }) =>
      updateBudgetMonth(month, data),
    onSuccess: (_, { month }) => {
      qc.invalidateQueries({ queryKey: ["budgetMonths"] });
      qc.invalidateQueries({ queryKey: ["budgetMonth", month] });
      qc.invalidateQueries({ queryKey: ["budgetOverview", month] });
    },
  });
}

export function useDeleteBudgetMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteBudgetMonth,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgetMonths"] }),
  });
}

// Fixed Commitments
export function useCreateFixedCommitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, data }: { month: string; data: Parameters<typeof createFixedCommitment>[1] }) =>
      createFixedCommitment(month, data),
    onSuccess: (_, { month }) => {
      qc.invalidateQueries({ queryKey: ["budgetMonth", month] });
      qc.invalidateQueries({ queryKey: ["budgetOverview", month] });
    },
  });
}

export function useUpdateFixedCommitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateFixedCommitment>[1] }) =>
      updateFixedCommitment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgetMonth"] });
      qc.invalidateQueries({ queryKey: ["budgetOverview"] });
    },
  });
}

export function useDeleteFixedCommitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFixedCommitment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgetMonth"] });
      qc.invalidateQueries({ queryKey: ["budgetOverview"] });
    },
  });
}

// Planned Spends
export function useCreatePlannedSpend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, data }: { month: string; data: Parameters<typeof createPlannedSpend>[1] }) =>
      createPlannedSpend(month, data),
    onSuccess: (_, { month }) => {
      qc.invalidateQueries({ queryKey: ["budgetMonth", month] });
      qc.invalidateQueries({ queryKey: ["budgetOverview", month] });
    },
  });
}

export function useUpdatePlannedSpend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePlannedSpend>[1] }) =>
      updatePlannedSpend(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgetMonth"] });
      qc.invalidateQueries({ queryKey: ["budgetOverview"] });
    },
  });
}

export function useDeletePlannedSpend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePlannedSpend,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgetMonth"] });
      qc.invalidateQueries({ queryKey: ["budgetOverview"] });
    },
  });
}

// Category Plans
export function useCreateCategoryPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, data }: { month: string; data: Parameters<typeof createCategoryPlan>[1] }) =>
      createCategoryPlan(month, data),
    onSuccess: (_, { month }) => {
      qc.invalidateQueries({ queryKey: ["budgetMonth", month] });
      qc.invalidateQueries({ queryKey: ["spendingBreakdown", month] });
    },
  });
}

export function useUpdateCategoryPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateCategoryPlan>[1] }) =>
      updateCategoryPlan(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgetMonth"] });
      qc.invalidateQueries({ queryKey: ["spendingBreakdown"] });
    },
  });
}

export function useDeleteCategoryPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCategoryPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgetMonth"] });
      qc.invalidateQueries({ queryKey: ["spendingBreakdown"] });
    },
  });
}

// Dashboard Queries
export function useBudgetOverview(month: string) {
  return useQuery({
    queryKey: ["budgetOverview", month],
    queryFn: () => fetchBudgetOverview(month),
    enabled: !!month,
    retry: false,
  });
}

export function useCurrentBudgetOverview() {
  return useQuery({
    queryKey: ["currentBudgetOverview"],
    queryFn: fetchCurrentBudgetOverview,
    retry: false,
  });
}

export function useSpendingBreakdown(month: string) {
  return useQuery({
    queryKey: ["spendingBreakdown", month],
    queryFn: () => fetchSpendingBreakdown(month),
    enabled: !!month,
  });
}

export function useOverspendCategories(month: string) {
  return useQuery({
    queryKey: ["overspendCategories", month],
    queryFn: () => fetchOverspendCategories(month),
    enabled: !!month,
  });
}

// Monthly Pace (Layer 2)
export function useMonthlyPace(month: string) {
  return useQuery({
    queryKey: ["monthlyPace", month],
    queryFn: () => fetchMonthlyPace(month),
    enabled: !!month,
    retry: false,
  });
}

// Category Pressure Detail (Layer 4)
export function useCategoryPressureDetail(month: string, categoryId: string | null) {
  return useQuery({
    queryKey: ["categoryPressureDetail", month, categoryId],
    queryFn: () => fetchCategoryPressureDetail(month, categoryId!),
    enabled: !!month && !!categoryId,
  });
}

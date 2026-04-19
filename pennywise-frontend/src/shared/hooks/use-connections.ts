import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchConnections,
  deleteConnection,
  syncAll,
  syncConnection,
} from "@/shared/lib/api";

export function useConnections() {
  return useQuery({
    queryKey: ["connections"],
    queryFn: fetchConnections,
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
}

export function useSyncAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncAll,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["connections"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

export function useSyncConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncConnection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["connections"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

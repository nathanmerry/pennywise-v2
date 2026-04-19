import { useQuery } from "@tanstack/react-query";
import { fetchAccounts } from "@/shared/lib/api";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });
}

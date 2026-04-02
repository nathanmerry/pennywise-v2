import { useQuery } from "@tanstack/react-query";
import { fetchAccounts } from "../lib/api";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });
}

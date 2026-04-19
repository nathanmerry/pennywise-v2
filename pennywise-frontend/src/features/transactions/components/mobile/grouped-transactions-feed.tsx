import { useMemo } from "react";
import type { Transaction } from "@/shared/lib/api";
import { groupTransactionsByDay } from "../../lib/group-transactions";
import { TransactionDaySection } from "./transaction-day-section";

interface Props {
  transactions: Transaction[];
  onTap?: (tx: Transaction) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function GroupedTransactionsFeed({
  transactions,
  onTap,
  selectMode,
  selectedIds,
  onToggleSelect,
}: Props) {
  const groups = useMemo(
    () => groupTransactionsByDay(transactions),
    [transactions],
  );

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <TransactionDaySection
          key={g.dateKey}
          group={g}
          onTap={onTap}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

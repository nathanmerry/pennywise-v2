import { useMemo } from "react";
import type { Transaction } from "@/shared/lib/api";
import { groupTransactionsByDay } from "../../lib/group-transactions";
import { TransactionDaySection } from "./transaction-day-section";
import type { MobileTxAction } from "./mobile-transaction-row";

interface Props {
  transactions: Transaction[];
  onAction: (action: MobileTxAction, tx: Transaction) => void;
}

export function GroupedTransactionsFeed({ transactions, onAction }: Props) {
  const groups = useMemo(
    () => groupTransactionsByDay(transactions),
    [transactions],
  );

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <TransactionDaySection key={g.dateKey} group={g} onAction={onAction} />
      ))}
    </div>
  );
}

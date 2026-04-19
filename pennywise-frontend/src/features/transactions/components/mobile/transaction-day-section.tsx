import type { Transaction } from "@/shared/lib/api";
import {
  formatAmount,
  type TransactionDayGroup,
} from "../../lib/group-transactions";
import {
  MobileTransactionRow,
  type MobileTxAction,
} from "./mobile-transaction-row";

interface Props {
  group: TransactionDayGroup;
  onAction: (action: MobileTxAction, tx: Transaction) => void;
}

export function TransactionDaySection({ group, onAction }: Props) {
  return (
    <section>
      <div className="flex items-baseline justify-between pb-1">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {group.label}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatAmount(group.total, group.currency)}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {group.transactions.map((tx) => (
          <MobileTransactionRow key={tx.id} tx={tx} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}

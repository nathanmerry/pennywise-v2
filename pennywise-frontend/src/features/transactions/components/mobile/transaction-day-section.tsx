import type { Transaction } from "@/shared/lib/api";
import {
  formatAmount,
  type TransactionDayGroup,
} from "../../lib/group-transactions";
import { MobileTransactionRow } from "./mobile-transaction-row";

interface Props {
  group: TransactionDayGroup;
  onTap?: (tx: Transaction) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function TransactionDaySection({
  group,
  onTap,
  selectMode,
  selectedIds,
  onToggleSelect,
}: Props) {
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
          <MobileTransactionRow
            key={tx.id}
            tx={tx}
            onTap={onTap}
            selectMode={selectMode}
            selected={selectedIds?.has(tx.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </section>
  );
}

interface Props {
  count?: number;
  dateLabel: string;
}

export function TransactionsSummary({ count, dateLabel }: Props) {
  const countText =
    count === undefined ? "…" : `${count.toLocaleString()} transactions`;

  return (
    <div className="text-sm text-muted-foreground">
      {countText} · {dateLabel}
    </div>
  );
}

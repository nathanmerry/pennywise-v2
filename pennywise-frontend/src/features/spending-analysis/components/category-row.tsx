import {
  ArrowUpDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { TableCell, TableRow } from "@/shared/components/ui/table";
import { cn } from "@/shared/lib/utils";
import type { CategoryAnalysisRow } from "@/shared/lib/api";
import {
  formatCurrency,
  formatChange,
} from "../lib/spending-formatters";
import { Sparkline } from "./sparkline";

function getTarget(row: CategoryAnalysisRow): {
  target: number | null;
  label: string;
} {
  if (row.kind === "fixed") {
    return { target: row.plannedAmount, label: "planned" };
  }
  return { target: row.budget?.monthlyBudget ?? null, label: "budget" };
}

function BudgetDelta({ row }: { row: CategoryAnalysisRow }) {
  const { target } = getTarget(row);
  if (target === null) return null;

  const delta = row.spend - target;
  const deltaAbs = Math.abs(delta);

  if (deltaAbs < 1) {
    return <span className='text-muted-foreground'>on target</span>;
  }
  return delta > 0 ? (
    <span className='text-destructive font-medium tabular-nums'>
      {formatCurrency(deltaAbs)} over
    </span>
  ) : (
    <span className='text-green-600 font-medium tabular-nums'>
      {formatCurrency(deltaAbs)} under
    </span>
  );
}

function BudgetCell({ row }: { row: CategoryAnalysisRow }) {
  const { target, label } = getTarget(row);

  if (target === null) {
    return <span className='text-muted-foreground'>-</span>;
  }

  return (
    <div className='text-sm tabular-nums leading-tight'>
      <div className='text-xs text-muted-foreground'>
        {formatCurrency(row.spend)} / {formatCurrency(target)} {label}
      </div>
      <div>
        <BudgetDelta row={row} />
      </div>
    </div>
  );
}

function TrendGlyph({ row }: { row: CategoryAnalysisRow }) {
  if (row.kind === "fixed" || row.changeAmount === null) {
    return null;
  }
  if (row.changeAmount > 0) {
    return (
      <span className='inline-flex items-center gap-0.5 text-destructive'>
        <ArrowUpRight className='h-3.5 w-3.5' /> trending up
      </span>
    );
  }
  if (row.changeAmount < 0) {
    return (
      <span className='inline-flex items-center gap-0.5 text-green-600'>
        <ArrowDownRight className='h-3.5 w-3.5' /> trending down
      </span>
    );
  }
  return null;
}

export function CategoryTableRow({
  row,
  selected,
  onSelect,
  showVsPrevious,
  showBudget,
}: {
  row: CategoryAnalysisRow;
  selected: boolean;
  onSelect: (id: string) => void;
  showVsPrevious: boolean;
  showBudget: boolean;
}) {
  const isFixed = row.kind === "fixed";

  return (
    <TableRow
      className='cursor-pointer'
      data-state={selected ? "selected" : undefined}
      onClick={() => onSelect(row.categoryId)}
    >
      <TableCell>
        <div className='flex items-center gap-2'>
          <div className='min-w-0'>
            <p className='font-medium truncate'>{row.categoryName}</p>
            <p className='text-xs text-muted-foreground sm:text-sm'>
              {row.transactionCount} transactions
            </p>
          </div>
          <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
        </div>
      </TableCell>
      <TableCell className='font-semibold tabular-nums'>
        {formatCurrency(row.spend)}
      </TableCell>
      <TableCell>{Math.round(row.shareOfTotal)}%</TableCell>
      {showVsPrevious && (
        <TableCell>
          {isFixed ? (
            <span className='text-muted-foreground'>-</span>
          ) : (
            <div
              className={cn(
                "inline-flex items-center gap-1 font-medium",
                row.changeAmount === null
                  ? "text-muted-foreground"
                  : row.changeAmount > 0
                    ? "text-destructive"
                    : row.changeAmount < 0
                      ? "text-green-600"
                      : "text-muted-foreground",
              )}
            >
              {row.changeAmount !== null && row.changeAmount > 0 ? (
                <ArrowUpRight className='h-4 w-4' />
              ) : row.changeAmount !== null && row.changeAmount < 0 ? (
                <ArrowDownRight className='h-4 w-4' />
              ) : (
                <ArrowUpDown className='h-4 w-4' />
              )}
              <span>{formatChange(row.changeAmount, row.changePercent)}</span>
            </div>
          )}
        </TableCell>
      )}
      <TableCell>{row.transactionCount}</TableCell>
      <TableCell>{formatCurrency(row.averageTransaction)}</TableCell>
      <TableCell className='hidden xl:table-cell'>
        <Sparkline values={row.sparkline} />
      </TableCell>
      {showBudget && (
        <TableCell>
          <BudgetCell row={row} />
        </TableCell>
      )}
    </TableRow>
  );
}

export function CategoryMobileRow({
  row,
  selected,
  onSelect,
}: {
  row: CategoryAnalysisRow;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { target } = getTarget(row);
  const trend = <TrendGlyph row={row} />;

  return (
    <button
      type='button'
      onClick={() => onSelect(row.categoryId)}
      className={cn(
        "group block w-full py-2.5 text-left transition-colors",
        "border-l-2 border-transparent -ml-3 pl-3 pr-1",
        "active:bg-accent/40 hover:bg-accent/20",
        selected && "border-primary bg-accent/30",
      )}
    >
      <div className='flex items-baseline justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-1'>
          <p className='font-medium truncate'>{row.categoryName}</p>
          <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5' />
        </div>
        <p className='text-base font-semibold tabular-nums'>
          {formatCurrency(row.spend)}
        </p>
      </div>

      <div className='mt-0.5 flex items-baseline justify-between gap-3 text-sm text-muted-foreground'>
        <span>
          {row.transactionCount}{" "}
          {row.transactionCount === 1 ? "transaction" : "transactions"}
        </span>
        {target !== null ? <BudgetDelta row={row} /> : null}
      </div>

      <p className='mt-0.5 text-xs text-muted-foreground/80'>
        <span className='font-medium text-foreground/70'>
          {Math.round(row.shareOfTotal)}% of spend
        </span>
        {" · "}
        {formatCurrency(row.averageTransaction)} avg
        {trend !== null && (
          <>
            {" · "}
            {trend}
          </>
        )}
      </p>
    </button>
  );
}

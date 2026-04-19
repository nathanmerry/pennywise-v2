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

function BudgetCell({ row }: { row: CategoryAnalysisRow }) {
  const isFixed = row.kind === "fixed";
  const target = isFixed
    ? row.plannedAmount
    : (row.budget?.monthlyBudget ?? null);

  if (target === null) {
    return <span className='text-muted-foreground'>-</span>;
  }

  const delta = row.spend - target;
  const deltaAbs = Math.abs(delta);
  const targetLabel = isFixed ? "planned" : "budget";

  const deltaNode =
    deltaAbs < 1 ? (
      <span className='text-muted-foreground'>on target</span>
    ) : delta > 0 ? (
      <span className='text-destructive'>
        {formatCurrency(deltaAbs)} over
      </span>
    ) : (
      <span className='text-green-600'>
        {formatCurrency(deltaAbs)} under
      </span>
    );

  return (
    <div className='text-sm tabular-nums leading-tight'>
      <div className='text-xs text-muted-foreground'>
        {formatCurrency(row.spend)} / {formatCurrency(target)} {targetLabel}
      </div>
      <div className='font-medium'>{deltaNode}</div>
    </div>
  );
}

export function CategoryRow({
  row,
  selected,
  onSelect,
}: {
  row: CategoryAnalysisRow;
  selected: boolean;
  onSelect: (id: string) => void;
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
              {!isFixed && (
                <span className='md:hidden'>
                  {" · "}
                  {formatChange(row.changeAmount, row.changePercent)}
                </span>
              )}
            </p>
          </div>
          <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
        </div>
      </TableCell>
      <TableCell className='font-semibold tabular-nums'>
        {formatCurrency(row.spend)}
      </TableCell>
      <TableCell className='hidden sm:table-cell'>
        {Math.round(row.shareOfTotal)}%
      </TableCell>
      <TableCell className='hidden md:table-cell'>
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
      <TableCell className='hidden lg:table-cell'>
        {row.transactionCount}
      </TableCell>
      <TableCell className='hidden lg:table-cell'>
        {formatCurrency(row.averageTransaction)}
      </TableCell>
      <TableCell className='hidden xl:table-cell'>
        <Sparkline values={row.sparkline} />
      </TableCell>
      <TableCell className='hidden sm:table-cell'>
        <BudgetCell row={row} />
      </TableCell>
    </TableRow>
  );
}

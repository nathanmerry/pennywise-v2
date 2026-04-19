import { ArrowUpDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import type { CategoryAnalysisRow } from "@/shared/lib/api";
import { CategoryRow } from "./category-row";

export type CategorySortKey =
  | "spend"
  | "shareOfTotal"
  | "changeAmount"
  | "transactionCount"
  | "averageTransaction";

interface CategoryBreakdownCardProps {
  flexibleCategories: CategoryAnalysisRow[];
  fixedCategories: CategoryAnalysisRow[];
  onToggleSort: (key: CategorySortKey) => void;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  budgetStatusLabel: string | null;
}

export function CategoryBreakdownCard({
  flexibleCategories,
  fixedCategories,
  onToggleSort,
  selectedCategoryId,
  onSelectCategory,
  budgetStatusLabel,
}: CategoryBreakdownCardProps) {
  const isEmpty =
    flexibleCategories.length === 0 && fixedCategories.length === 0;

  return (
    <Card>
      <CardHeader className='space-y-2'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <CardTitle className='text-base'>Category breakdown</CardTitle>
            <p className='text-sm text-muted-foreground'>
              Sort the table, then open a category to inspect merchants, timing,
              and recurring vs one-off spend.
            </p>
          </div>
          {budgetStatusLabel && (
            <div className='rounded-lg border px-3 py-2 text-right'>
              <p className='text-xs uppercase tracking-wide text-muted-foreground'>
                Pace status
              </p>
              <p className='font-semibold'>{budgetStatusLabel}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className='px-0 sm:px-6'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>
                <Button
                  variant='ghost'
                  size='sm'
                  className='-ml-3'
                  onClick={() => onToggleSort("spend")}
                >
                  Spend
                  <ArrowUpDown className='ml-2 h-4 w-4' />
                </Button>
              </TableHead>
              <TableHead className='hidden sm:table-cell'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='-ml-3'
                  onClick={() => onToggleSort("shareOfTotal")}
                >
                  % of total
                  <ArrowUpDown className='ml-2 h-4 w-4' />
                </Button>
              </TableHead>
              <TableHead className='hidden md:table-cell'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='-ml-3'
                  onClick={() => onToggleSort("changeAmount")}
                >
                  Vs previous
                  <ArrowUpDown className='ml-2 h-4 w-4' />
                </Button>
              </TableHead>
              <TableHead className='hidden lg:table-cell'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='-ml-3'
                  onClick={() => onToggleSort("transactionCount")}
                >
                  Transactions
                  <ArrowUpDown className='ml-2 h-4 w-4' />
                </Button>
              </TableHead>
              <TableHead className='hidden lg:table-cell'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='-ml-3'
                  onClick={() => onToggleSort("averageTransaction")}
                >
                  Avg transaction
                  <ArrowUpDown className='ml-2 h-4 w-4' />
                </Button>
              </TableHead>
              <TableHead className='hidden xl:table-cell'>Trend</TableHead>
              <TableHead className='hidden sm:table-cell'>Budget</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isEmpty && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className='py-8 text-center text-muted-foreground'
                >
                  No categories found for the current filters.
                </TableCell>
              </TableRow>
            )}

            {flexibleCategories.length > 0 && (
              <>
                <TableRow className='bg-muted/40 hover:bg-muted/40'>
                  <TableCell
                    colSpan={8}
                    className='py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground'
                  >
                    Flexible
                  </TableCell>
                </TableRow>
                {flexibleCategories.map((row) => (
                  <CategoryRow
                    key={row.categoryId}
                    row={row}
                    selected={selectedCategoryId === row.categoryId}
                    onSelect={onSelectCategory}
                  />
                ))}
              </>
            )}

            {fixedCategories.length > 0 && (
              <>
                <TableRow className='bg-muted/40 hover:bg-muted/40'>
                  <TableCell
                    colSpan={8}
                    className='py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground'
                  >
                    Fixed
                  </TableCell>
                </TableRow>
                {fixedCategories.map((row) => (
                  <CategoryRow
                    key={row.categoryId}
                    row={row}
                    selected={selectedCategoryId === row.categoryId}
                    onSelect={onSelectCategory}
                  />
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

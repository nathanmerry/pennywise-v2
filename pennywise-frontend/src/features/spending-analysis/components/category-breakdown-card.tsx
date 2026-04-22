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
import { formatCurrency } from "../lib/spending-formatters";
import { CategoryTableRow, CategoryMobileRow } from "./category-row";

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
  showVsPrevious: boolean;
  showBudget: boolean;
}

function sumSpend(rows: CategoryAnalysisRow[]): number {
  return rows.reduce((sum, row) => sum + row.spend, 0);
}

function GroupHeading({
  label,
  total,
  sharePercent,
}: {
  label: string;
  total: number;
  sharePercent: number;
}) {
  return (
    <p className='text-sm font-semibold text-muted-foreground'>
      {label} — {formatCurrency(total)}{" "}
      <span className='font-normal'>({Math.round(sharePercent)}%)</span>
    </p>
  );
}

export function CategoryBreakdownCard({
  flexibleCategories,
  fixedCategories,
  onToggleSort,
  selectedCategoryId,
  onSelectCategory,
  showVsPrevious,
  showBudget,
}: CategoryBreakdownCardProps) {
  const isEmpty =
    flexibleCategories.length === 0 && fixedCategories.length === 0;

  const flexibleTotal = sumSpend(flexibleCategories);
  const fixedTotal = sumSpend(fixedCategories);
  const grandTotal = flexibleTotal + fixedTotal;
  const flexibleShare = grandTotal > 0 ? (flexibleTotal / grandTotal) * 100 : 0;
  const fixedShare = grandTotal > 0 ? (fixedTotal / grandTotal) * 100 : 0;

  // Category | Spend | % | [Vs previous?] | Txns | Avg | Trend (xl) | [Budget?]
  const groupHeaderColSpan = 5 + (showVsPrevious ? 1 : 0) + (showBudget ? 1 : 0) + 1;

  const mobileContent = isEmpty ? (
    <p className='py-8 text-center text-sm text-muted-foreground'>
      No categories found for the current filters.
    </p>
  ) : (
    <div className='space-y-8'>
      {flexibleCategories.length > 0 && (
        <section className='space-y-2'>
          <GroupHeading
            label='Flexible'
            total={flexibleTotal}
            sharePercent={flexibleShare}
          />
          <div className='divide-y divide-border'>
            {flexibleCategories.map((row) => (
              <CategoryMobileRow
                key={row.categoryId}
                row={row}
                selected={selectedCategoryId === row.categoryId}
                onSelect={onSelectCategory}
              />
            ))}
          </div>
        </section>
      )}

      {fixedCategories.length > 0 && (
        <section className='space-y-2'>
          <GroupHeading
            label='Fixed'
            total={fixedTotal}
            sharePercent={fixedShare}
          />
          <div className='divide-y divide-border'>
            {fixedCategories.map((row) => (
              <CategoryMobileRow
                key={row.categoryId}
                row={row}
                selected={selectedCategoryId === row.categoryId}
                onSelect={onSelectCategory}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile / tablet: flat list, no outer card */}
      <div className='space-y-3 lg:hidden'>
        <h2 className='text-base font-semibold'>Category breakdown</h2>
        {mobileContent}
      </div>

      {/* Desktop: full card + table */}
      <Card className='hidden lg:block'>
        <CardHeader>
          <CardTitle className='text-base'>Category breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>
              No categories found for the current filters.
            </p>
          ) : (
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
                    <TableHead>
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
                    {showVsPrevious && (
                      <TableHead>
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
                    )}
                    <TableHead>
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
                    <TableHead>
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
                    {showBudget && <TableHead>Budget</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flexibleCategories.length > 0 && (
                    <>
                      <TableRow className='bg-muted/40 hover:bg-muted/40'>
                        <TableCell colSpan={groupHeaderColSpan} className='py-2'>
                          <GroupHeading
                            label='Flexible'
                            total={flexibleTotal}
                            sharePercent={flexibleShare}
                          />
                        </TableCell>
                      </TableRow>
                      {flexibleCategories.map((row) => (
                        <CategoryTableRow
                          key={row.categoryId}
                          row={row}
                          selected={selectedCategoryId === row.categoryId}
                          onSelect={onSelectCategory}
                          showVsPrevious={showVsPrevious}
                          showBudget={showBudget}
                        />
                      ))}
                    </>
                  )}

                  {fixedCategories.length > 0 && (
                    <>
                      <TableRow className='bg-muted/40 hover:bg-muted/40'>
                        <TableCell colSpan={groupHeaderColSpan} className='py-2'>
                          <GroupHeading
                            label='Fixed'
                            total={fixedTotal}
                            sharePercent={fixedShare}
                          />
                        </TableCell>
                      </TableRow>
                      {fixedCategories.map((row) => (
                        <CategoryTableRow
                          key={row.categoryId}
                          row={row}
                          selected={selectedCategoryId === row.categoryId}
                          onSelect={onSelectCategory}
                          showVsPrevious={showVsPrevious}
                          showBudget={showBudget}
                        />
                      ))}
                    </>
                  )}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

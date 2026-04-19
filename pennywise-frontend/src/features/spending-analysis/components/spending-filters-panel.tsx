import { useMemo } from "react";
import { format } from "date-fns";
import { CalendarIcon, RotateCcw } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Calendar } from "@/shared/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import type { Account, AnalysisPreset, Category } from "@/shared/lib/api";
import {
  PRESET_OPTIONS,
  getPresetLabel,
  type CustomRange,
} from "../lib/spending-filters";

interface SpendingFiltersPanelProps {
  preset: AnalysisPreset;
  onPresetChange: (preset: AnalysisPreset) => void;
  customRange: CustomRange;
  onCustomRangeChange: (range: CustomRange) => void;
  accountId: string | undefined;
  onAccountIdChange: (id: string | undefined) => void;
  categoryId: string | undefined;
  onCategoryIdChange: (id: string | undefined) => void;
  comparePrevious: boolean;
  onComparePreviousChange: (value: boolean) => void;
  includeIgnored: boolean;
  onIncludeIgnoredChange: (value: boolean) => void;
  accounts: Account[];
  categories: Category[];
  periodLabel: string;
  selectedAccountLabel: string;
  selectedCategoryLabel: string;
  hasCustomFilters: boolean;
  onReset: () => void;
}

interface CategoryOption {
  id: string;
  label: string;
}

function useCategoryOptions(categories: Category[]): CategoryOption[] {
  return useMemo(() => {
    const parents = categories.filter((category) => !category.parentId);
    return parents.flatMap((parent) => [
      { id: parent.id, label: parent.name },
      ...categories
        .filter((category) => category.parentId === parent.id)
        .map((child) => ({ id: child.id, label: `  ${child.name}` })),
    ]);
  }, [categories]);
}

export function SpendingFiltersPanel({
  preset,
  onPresetChange,
  customRange,
  onCustomRangeChange,
  accountId,
  onAccountIdChange,
  categoryId,
  onCategoryIdChange,
  comparePrevious,
  onComparePreviousChange,
  includeIgnored,
  onIncludeIgnoredChange,
  accounts,
  categories,
  periodLabel,
  selectedAccountLabel,
  selectedCategoryLabel,
  hasCustomFilters,
  onReset,
}: SpendingFiltersPanelProps) {
  const categoryOptions = useCategoryOptions(categories);

  return (
    <div className='space-y-3 rounded-2xl border bg-card/60 px-4 py-4'>
      <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
        <div className='flex flex-col gap-3'>
          <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
            <span className='text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground'>
              Time range
            </span>
            <div className='-mx-4 overflow-x-auto sm:mx-0'>
              <div className='flex min-w-min items-center gap-1 rounded-xl bg-muted p-1 px-4 sm:px-1'>
                {PRESET_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={preset === option.value ? "default" : "ghost"}
                    size='sm'
                    className={cn(
                      "rounded-lg shrink-0",
                      preset === option.value
                        ? "shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => onPresetChange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <div className='rounded-xl border bg-background px-4 py-2'>
              <p className='text-sm font-semibold'>{getPresetLabel(preset)}</p>
              <p className='text-sm text-muted-foreground'>{periodLabel}</p>
            </div>

            {preset === "custom" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant='outline'
                      className='justify-start text-left font-normal'
                    >
                      <CalendarIcon className='mr-2 h-4 w-4' />
                      {customRange.start
                        ? format(customRange.start, "dd MMM yyyy")
                        : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={customRange.start ?? undefined}
                      onSelect={(date) =>
                        onCustomRangeChange({
                          ...customRange,
                          start: date ?? null,
                        })
                      }
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant='outline'
                      className='justify-start text-left font-normal'
                    >
                      <CalendarIcon className='mr-2 h-4 w-4' />
                      {customRange.end
                        ? format(customRange.end, "dd MMM yyyy")
                        : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={customRange.end ?? undefined}
                      onSelect={(date) =>
                        onCustomRangeChange({
                          ...customRange,
                          end: date ?? null,
                        })
                      }
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>
        </div>

        <div className='rounded-xl border bg-background px-4 py-2 text-sm'>
          <p className='text-muted-foreground'>
            Showing posted outflows for {selectedAccountLabel} in{" "}
            {selectedCategoryLabel}.
          </p>
          <p className='font-medium'>
            {comparePrevious
              ? "Comparing with the previous period."
              : "No comparison applied."}
          </p>
        </div>
      </div>

      <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
        <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
          <Select
            value={accountId || "all"}
            onValueChange={(value) =>
              onAccountIdChange(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className='w-full min-w-0 sm:w-auto sm:min-w-44 bg-background'>
              <SelectValue placeholder='All accounts' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All accounts</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.accountName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={categoryId || "all"}
            onValueChange={(value) =>
              onCategoryIdChange(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className='w-full min-w-0 sm:w-auto sm:min-w-44 bg-background'>
              <SelectValue placeholder='All categories' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All categories</SelectItem>
              {categoryOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className='flex flex-wrap items-center gap-2'>
            <div className='flex items-center gap-1 rounded-xl border bg-background p-1'>
              <Button
                variant={comparePrevious ? "ghost" : "default"}
                size='sm'
                onClick={() => onComparePreviousChange(false)}
              >
                No comparison
              </Button>
              <Button
                variant={comparePrevious ? "default" : "ghost"}
                size='sm'
                onClick={() => onComparePreviousChange(true)}
              >
                Vs previous
              </Button>
            </div>

            <Button
              variant={includeIgnored ? "secondary" : "ghost"}
              size='sm'
              className={cn(
                "rounded-xl",
                !includeIgnored && "text-muted-foreground",
              )}
              onClick={() => onIncludeIgnoredChange(!includeIgnored)}
            >
              Include ignored
            </Button>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          {(accountId || categoryId || includeIgnored) && (
            <div className='hidden flex-wrap items-center gap-2 lg:flex'>
              {accountId && (
                <Badge variant='outline'>{selectedAccountLabel}</Badge>
              )}
              {categoryId && (
                <Badge variant='outline'>{selectedCategoryLabel}</Badge>
              )}
              {includeIgnored && (
                <Badge variant='outline'>Ignored included</Badge>
              )}
            </div>
          )}

          {hasCustomFilters && (
            <Button variant='ghost' size='sm' onClick={onReset}>
              <RotateCcw className='mr-2 h-4 w-4' />
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

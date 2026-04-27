import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Calendar } from "@/shared/components/ui/calendar";
import { Label } from "@/shared/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";
import type { Account, AnalysisPreset, Category } from "@/shared/lib/api";
import {
  PRESET_OPTIONS,
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
  hasCustomFilters: boolean;
  onReset: () => void;
}

type SheetKey = "account" | "category" | "secondary";

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
  hasCustomFilters,
  onReset,
}: SpendingFiltersPanelProps) {
  const [open, setOpen] = useState<SheetKey | null>(null);
  const close = () => setOpen(null);

  const topLevelCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const accountLabel = accountId
    ? (accounts.find((a) => a.id === accountId)?.accountName ?? "Account")
    : "All accounts";

  const categoryLabel = categoryId
    ? (categories.find((c) => c.id === categoryId)?.name ?? "Category")
    : "All categories";

  const secondaryCount = (comparePrevious ? 1 : 0) + (includeIgnored ? 1 : 0);

  return (
    <div className='space-y-3'>
      {/* Preset chips */}
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

      {/* Primary chips + custom date pickers + secondary sheet trigger + reset */}
      <div className='-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <Chip
          active={!!accountId}
          onClick={() => setOpen("account")}
          label={accountLabel}
        />
        <Chip
          active={!!categoryId}
          onClick={() => setOpen("category")}
          label={categoryLabel}
        />

        {preset === "custom" && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  className={cn(
                    "h-8 shrink-0 rounded-full border bg-background text-sm font-normal",
                    !customRange.start && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className='mr-1.5 h-3.5 w-3.5' />
                  {customRange.start
                    ? format(customRange.start, "dd MMM yy")
                    : "Start"}
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
                  size='sm'
                  className={cn(
                    "h-8 shrink-0 rounded-full border bg-background text-sm font-normal",
                    !customRange.end && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className='mr-1.5 h-3.5 w-3.5' />
                  {customRange.end
                    ? format(customRange.end, "dd MMM yy")
                    : "End"}
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

        <Sheet
          open={open === "secondary"}
          onOpenChange={(o) => !o && close()}
        >
          <SheetTrigger asChild>
            <button
              type='button'
              onClick={() => setOpen("secondary")}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                secondaryCount > 0
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-accent",
              )}
            >
              <SlidersHorizontal className='h-3.5 w-3.5' />
              <span>Filters</span>
              {secondaryCount > 0 && (
                <span className='inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-background/20 px-1 text-[10px] font-medium'>
                  {secondaryCount}
                </span>
              )}
            </button>
          </SheetTrigger>
          <SheetContent side='bottom' className='max-h-[80vh]'>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className='space-y-6 px-4 pb-6'>
              <div className='space-y-2'>
                <div>
                  <Label>Compare with previous</Label>
                  <p className='text-sm text-muted-foreground'>
                    Overlay the prior period of the same length on charts and
                    category deltas.
                  </p>
                </div>
                <div className='inline-flex items-center gap-1 rounded-xl border bg-background p-1'>
                  <Button
                    variant={comparePrevious ? "ghost" : "default"}
                    size='sm'
                    onClick={() => onComparePreviousChange(false)}
                  >
                    Off
                  </Button>
                  <Button
                    variant={comparePrevious ? "default" : "ghost"}
                    size='sm'
                    onClick={() => onComparePreviousChange(true)}
                  >
                    On
                  </Button>
                </div>
              </div>

              <div className='space-y-2'>
                <div>
                  <Label>Include ignored</Label>
                  <p className='text-sm text-muted-foreground'>
                    Include transactions you've marked as ignored in the
                    totals.
                  </p>
                </div>
                <div className='inline-flex items-center gap-1 rounded-xl border bg-background p-1'>
                  <Button
                    variant={includeIgnored ? "ghost" : "default"}
                    size='sm'
                    onClick={() => onIncludeIgnoredChange(false)}
                  >
                    Off
                  </Button>
                  <Button
                    variant={includeIgnored ? "default" : "ghost"}
                    size='sm'
                    onClick={() => onIncludeIgnoredChange(true)}
                  >
                    On
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {hasCustomFilters && (
          <Button variant='ghost' size='sm' onClick={onReset} className='shrink-0'>
            <RotateCcw className='mr-2 h-4 w-4' />
            Reset
          </Button>
        )}
      </div>

      {/* Account sheet */}
      <Sheet open={open === "account"} onOpenChange={(o) => !o && close()}>
        <SheetContent side='bottom' className='max-h-[80vh]'>
          <SheetHeader>
            <SheetTitle>Account</SheetTitle>
          </SheetHeader>
          <div className='overflow-y-auto px-4 pb-6'>
            <OptionRow
              selected={!accountId}
              onClick={() => {
                onAccountIdChange(undefined);
                close();
              }}
            >
              All accounts
            </OptionRow>
            {accounts.map((a) => (
              <OptionRow
                key={a.id}
                selected={accountId === a.id}
                onClick={() => {
                  onAccountIdChange(a.id);
                  close();
                }}
              >
                {a.accountName}
              </OptionRow>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Category sheet */}
      <Sheet open={open === "category"} onOpenChange={(o) => !o && close()}>
        <SheetContent side='bottom' className='max-h-[80vh]'>
          <SheetHeader>
            <SheetTitle>Category</SheetTitle>
          </SheetHeader>
          <div className='overflow-y-auto px-4 pb-6'>
            <OptionRow
              selected={!categoryId}
              onClick={() => {
                onCategoryIdChange(undefined);
                close();
              }}
            >
              All categories
            </OptionRow>
            {topLevelCategories.map((parent) => {
              const children = categories.filter(
                (c) => c.parentId === parent.id,
              );
              return (
                <div key={parent.id}>
                  <OptionRow
                    selected={categoryId === parent.id}
                    onClick={() => {
                      onCategoryIdChange(parent.id);
                      close();
                    }}
                  >
                    {parent.name}
                  </OptionRow>
                  {children.map((child) => (
                    <OptionRow
                      key={child.id}
                      selected={categoryId === child.id}
                      onClick={() => {
                        onCategoryIdChange(child.id);
                        close();
                      }}
                      indent
                    >
                      {child.name}
                    </OptionRow>
                  ))}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      <span className='max-w-40 truncate'>{label}</span>
      <ChevronDown className='h-3.5 w-3.5 shrink-0 opacity-70' />
    </button>
  );
}

function OptionRow({
  selected,
  onClick,
  indent,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  indent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between border-b border-border/60 py-3 text-left text-sm last:border-0 active:bg-accent/50",
        indent && "pl-6",
      )}
    >
      <span className={cn(selected && "font-medium")}>{children}</span>
      {selected && (
        <span className='ml-3 h-2 w-2 shrink-0 rounded-full bg-foreground' />
      )}
    </button>
  );
}

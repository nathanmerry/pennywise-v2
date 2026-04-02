import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { TransactionFilters as TFilters } from "../../lib/api";
import type { Account, Category } from "../../lib/api";

interface TransactionFilterBarProps {
  filters: TFilters;
  onFiltersChange: (filters: TFilters) => void;
  accounts: Account[];
  categories: Category[];
}

export function TransactionFilterBar({
  filters,
  onFiltersChange,
  accounts,
  categories,
}: TransactionFilterBarProps) {
  const [search, setSearch] = useState(filters.search || "");

  const update = (patch: Partial<TFilters>) => {
    onFiltersChange({ ...filters, ...patch, page: 1 });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update({ search });
  };

  const clearFilters = () => {
    setSearch("");
    onFiltersChange({ page: 1, limit: 50 });
  };

  const hasFilters =
    filters.accountId ||
    filters.categoryId ||
    filters.isIgnored !== undefined ||
    filters.from ||
    filters.to ||
    filters.search;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-56"
          />
        </div>
      </form>

      {/* Account filter */}
      <Select
        value={filters.accountId || "all"}
        onValueChange={(val: string) => update({ accountId: val === "all" ? undefined : val })}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((acc) => (
            <SelectItem key={acc.id} value={acc.id}>
              {acc.accountName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Category filter */}
      <Select
        value={filters.categoryId || "all"}
        onValueChange={(val: string) => update({ categoryId: val === "all" ? undefined : val })}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          <SelectItem value="uncategorised">Uncategorised</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Ignored filter */}
      <Select
        value={filters.isIgnored ?? "all"}
        onValueChange={(val: string) => update({ isIgnored: val === "all" ? undefined : val })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="All status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="false">Not ignored</SelectItem>
          <SelectItem value="true">Ignored</SelectItem>
        </SelectContent>
      </Select>

      {/* Date from */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-36 justify-start text-left font-normal",
              !filters.from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {filters.from ? format(new Date(filters.from), "dd MMM yy") : "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filters.from ? new Date(filters.from) : undefined}
            onSelect={(date) =>
              update({ from: date ? format(date, "yyyy-MM-dd") : undefined })
            }
          />
        </PopoverContent>
      </Popover>

      {/* Date to */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-36 justify-start text-left font-normal",
              !filters.to && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {filters.to ? format(new Date(filters.to), "dd MMM yy") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filters.to ? new Date(filters.to) : undefined}
            onSelect={(date) =>
              update({ to: date ? format(date, "yyyy-MM-dd") : undefined })
            }
          />
        </PopoverContent>
      </Popover>

      {/* Clear */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}

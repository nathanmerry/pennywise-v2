import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useCategories } from "@/shared/hooks/use-categories";
import { useCreateBudgetEvent } from "@/shared/hooks/use-budget";
import type { BudgetEventFundingSource } from "@/shared/lib/api";

interface AddEventDialogProps {
  month: string;
  /** Cycle bounds — used as default event date range. */
  cycleStart?: string;
  cycleEnd?: string;
  onClose: () => void;
}

interface PotDraft {
  key: string;
  name: string;
  amount: string;
  categoryId: string;
}

function newPotDraft(): PotDraft {
  return { key: Math.random().toString(36).slice(2), name: "", amount: "", categoryId: "" };
}

function isoDateOnly(iso?: string): string {
  return iso ? iso.slice(0, 10) : "";
}

export function AddEventDialog({ month, cycleStart, cycleEnd, onClose }: AddEventDialogProps) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(() => isoDateOnly(cycleStart));
  const [endDate, setEndDate] = useState(() => isoDateOnly(cycleEnd));
  const [cap, setCap] = useState("");
  const [fundingSource] = useState<BudgetEventFundingSource>("flexible");
  const [pots, setPots] = useState<PotDraft[]>([newPotDraft()]);

  const { data: categories } = useCategories();
  const parentCategories = categories?.filter((c) => !c.parentId) ?? [];
  const createEvent = useCreateBudgetEvent();

  const rangeIsInvalid = startDate && endDate && endDate < startDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate || !cap) return;
    if (rangeIsInvalid) return;

    const filledPots = pots
      .filter((p) => p.name && p.amount)
      .map((p, i) => ({
        name: p.name,
        amount: parseFloat(p.amount),
        categoryId: p.categoryId || null,
        sortOrder: i,
      }));

    await createEvent.mutateAsync({
      month,
      data: {
        name,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        cap: parseFloat(cap),
        fundingSource,
        pots: filledPots.length > 0 ? filledPots : undefined,
      },
    });
    onClose();
  };

  const updatePot = (key: string, patch: Partial<PotDraft>) => {
    setPots((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };
  const removePot = (key: string) => {
    setPots((prev) => prev.filter((p) => p.key !== key));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="event-name">Name</Label>
        <Input
          id="event-name"
          placeholder="e.g., Greece Wedding Trip"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event-start">Start Date</Label>
          <Input
            id="event-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-end">End Date</Label>
          <Input
            id="event-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      {rangeIsInvalid && (
        <p className="text-sm text-destructive">End date must be on or after start date.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event-cap">Cap (£)</Label>
          <Input
            id="event-cap"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Funding</Label>
          <Select value="flexible" disabled>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flexible">This cycle's flexible budget</SelectItem>
              <SelectItem value="savings" disabled>
                Savings (coming soon)
              </SelectItem>
              <SelectItem value="external" disabled>
                External (coming soon)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Pots (optional)</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPots((prev) => [...prev, newPotDraft()])}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add pot
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sub-allocations within the cap (e.g. Clothes / Food / Buffer). Linking to a category lets us
          show actual spend per pot.
        </p>
        {pots.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No pots — cap is one bucket.</p>
        )}
        {pots.map((pot) => (
          <div key={pot.key} className="space-y-2 rounded-md border bg-background p-2">
          <div className="flex items-center gap-2">
              <Input
                placeholder="Name (e.g., Clothes, Food, Buffer)"
                value={pot.name}
                onChange={(e) => updatePot(pot.key, { name: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removePot(pot.key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder="£"
                value={pot.amount}
                onChange={(e) => updatePot(pot.key, { amount: e.target.value })}
              />
              <Select
                value={pot.categoryId || "none"}
                onValueChange={(v) => updatePot(pot.key, { categoryId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {parentCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={createEvent.isPending || !!rangeIsInvalid}>
          Create Event
        </Button>
      </div>
    </form>
  );
}

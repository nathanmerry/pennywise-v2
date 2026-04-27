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
import {
  useCreateEventPot,
  useDeleteEventPot,
  useUpdateBudgetEvent,
  useUpdateEventPot,
} from "@/shared/hooks/use-budget";
import type { BudgetEvent } from "@/shared/lib/api";
import { isoDateOnly } from "@/features/budget/lib/cycle";

interface EditEventDialogProps {
  event: BudgetEvent;
  onClose: () => void;
}

interface PotDraft {
  /** Existing pot id, or null for unsaved drafts. */
  id: string | null;
  /** Stable key for React rendering. */
  key: string;
  name: string;
  amount: string;
  categoryId: string;
}

function potDraftFromExisting(p: BudgetEvent["pots"][number]): PotDraft {
  return {
    id: p.id,
    key: p.id,
    name: p.name,
    amount: p.amount,
    categoryId: p.categoryId ?? "",
  };
}

function newPotDraft(): PotDraft {
  return {
    id: null,
    key: Math.random().toString(36).slice(2),
    name: "",
    amount: "",
    categoryId: "",
  };
}

export function EditEventDialog({ event, onClose }: EditEventDialogProps) {
  const [name, setName] = useState(event.name);
  const [startDate, setStartDate] = useState(() => isoDateOnly(event.startDate));
  const [endDate, setEndDate] = useState(() => isoDateOnly(event.endDate));
  const [cap, setCap] = useState(String(event.cap));
  const [pots, setPots] = useState<PotDraft[]>(() =>
    event.pots.length > 0 ? event.pots.map(potDraftFromExisting) : [newPotDraft()]
  );

  const { data: categories } = useCategories();
  const parentCategories = categories?.filter((c) => !c.parentId) ?? [];
  const updateEvent = useUpdateBudgetEvent();
  const createPot = useCreateEventPot();
  const updatePotMutation = useUpdateEventPot();
  const deletePot = useDeleteEventPot();

  const rangeIsInvalid = startDate && endDate && endDate < startDate;
  const isPending =
    updateEvent.isPending ||
    createPot.isPending ||
    updatePotMutation.isPending ||
    deletePot.isPending;

  const updatePotState = (key: string, patch: Partial<PotDraft>) => {
    setPots((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };
  const removePotState = (key: string) => {
    setPots((prev) => prev.filter((p) => p.key !== key));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate || !cap) return;
    if (rangeIsInvalid) return;

    await updateEvent.mutateAsync({
      id: event.id,
      data: {
        name,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        cap: parseFloat(cap),
      },
    });

    // Diff pots: delete removed, create new, patch changed.
    const originalById = new Map(event.pots.map((p) => [p.id, p]));
    const draftIds = new Set(pots.filter((p) => p.id).map((p) => p.id!));
    const tasks: Promise<unknown>[] = [];

    for (const original of event.pots) {
      if (!draftIds.has(original.id)) {
        tasks.push(deletePot.mutateAsync(original.id));
      }
    }

    for (let i = 0; i < pots.length; i += 1) {
      const draft = pots[i];
      if (!draft.name || !draft.amount) continue;
      const amount = parseFloat(draft.amount);
      const categoryId = draft.categoryId || null;

      if (draft.id === null) {
        tasks.push(
          createPot.mutateAsync({
            eventId: event.id,
            data: { name: draft.name, amount, categoryId, sortOrder: i },
          })
        );
      } else {
        const orig = originalById.get(draft.id);
        const changed =
          !orig ||
          orig.name !== draft.name ||
          parseFloat(orig.amount) !== amount ||
          (orig.categoryId ?? null) !== categoryId ||
          orig.sortOrder !== i;
        if (changed) {
          tasks.push(
            updatePotMutation.mutateAsync({
              id: draft.id,
              data: { name: draft.name, amount, categoryId, sortOrder: i },
            })
          );
        }
      }
    }

    if (tasks.length > 0) await Promise.all(tasks);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-event-name">Name</Label>
        <Input
          id="edit-event-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-event-start">Start Date</Label>
          <Input
            id="edit-event-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-event-end">End Date</Label>
          <Input
            id="edit-event-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      {rangeIsInvalid && (
        <p className="text-sm text-destructive">End date must be on or after start date.</p>
      )}
      <div className="space-y-2">
        <Label htmlFor="edit-event-cap">Cap (£)</Label>
        <Input
          id="edit-event-cap"
          type="number"
          step="0.01"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
        />
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Pots</p>
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
        {pots.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No pots — cap is one bucket.</p>
        )}
        {pots.map((pot) => (
          <div key={pot.key} className="space-y-2 rounded-md border bg-background p-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Name (e.g., Clothes, Food, Buffer)"
                value={pot.name}
                onChange={(e) => updatePotState(pot.key, { name: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removePotState(pot.key)}
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
                onChange={(e) => updatePotState(pot.key, { amount: e.target.value })}
              />
              <Select
                value={pot.categoryId || "none"}
                onValueChange={(v) => updatePotState(pot.key, { categoryId: v === "none" ? "" : v })}
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
        <Button type="submit" disabled={isPending || !!rangeIsInvalid}>
          Save
        </Button>
      </div>
    </form>
  );
}

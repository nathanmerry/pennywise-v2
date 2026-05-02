import { useState } from "react";
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
import { useUpdatePlannedSpend } from "@/shared/hooks/use-budget";
import type { BudgetPlannedSpend } from "@/shared/lib/api";

interface EditPlannedSpendDialogProps {
  planned: BudgetPlannedSpend;
  onClose: () => void;
}

export function EditPlannedSpendDialog({ planned, onClose }: EditPlannedSpendDialogProps) {
  const [name, setName] = useState(planned.name);
  const [amount, setAmount] = useState(planned.amount);
  const [isEssential, setIsEssential] = useState(planned.isEssential);
  const [categoryId, setCategoryId] = useState<string>(planned.categoryId ?? "");
  const { data: categories } = useCategories();
  const updatePlanned = useUpdatePlannedSpend();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    await updatePlanned.mutateAsync({
      id: planned.id,
      data: {
        name,
        amount: parseFloat(amount),
        isEssential,
        categoryId: categoryId || null,
      },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-planned-name">Name</Label>
        <Input
          id="edit-planned-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-planned-amount">Amount (£)</Label>
        <Input
          id="edit-planned-amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Category</Label>
        <Select
          value={categoryId || "none"}
          onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Link to a category (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category link</SelectItem>
            {(categories ?? [])
              .filter((category) => !category.parentId)
              .flatMap((parent) => [
                <SelectItem key={parent.id} value={parent.id}>
                  {parent.name}
                </SelectItem>,
                ...(categories ?? [])
                  .filter((category) => category.parentId === parent.id)
                  .map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {`  ${child.name}`}
                    </SelectItem>
                  )),
              ])}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="edit-planned-essential"
          checked={isEssential}
          onChange={(e) => setIsEssential(e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="edit-planned-essential" className="text-sm font-normal">
          This is essential (not discretionary)
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={updatePlanned.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

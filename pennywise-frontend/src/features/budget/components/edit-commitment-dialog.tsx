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
import { useUpdateFixedCommitment } from "@/shared/hooks/use-budget";
import type { BudgetFixedCommitment } from "@/shared/lib/api";

interface EditCommitmentDialogProps {
  commitment: BudgetFixedCommitment;
  onClose: () => void;
}

export function EditCommitmentDialog({ commitment, onClose }: EditCommitmentDialogProps) {
  const [name, setName] = useState(commitment.name);
  const [amount, setAmount] = useState(commitment.amount);
  const [categoryId, setCategoryId] = useState<string>(commitment.categoryId ?? "");
  const { data: categories } = useCategories();
  const updateCommitment = useUpdateFixedCommitment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    await updateCommitment.mutateAsync({
      id: commitment.id,
      data: {
        name,
        amount: parseFloat(amount),
        categoryId: categoryId || null,
      },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-name">Name</Label>
        <Input
          id="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-amount">Amount (£)</Label>
        <Input
          id="edit-amount"
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
        <p className="text-xs text-muted-foreground">
          Linked categories get excluded from flexible-spend pacing.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateCommitment.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

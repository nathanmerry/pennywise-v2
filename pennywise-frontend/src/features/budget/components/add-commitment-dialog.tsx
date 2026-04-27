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
import { useCreateFixedCommitment } from "@/shared/hooks/use-budget";

interface AddCommitmentDialogProps {
  month: string;
  onClose: () => void;
}

export function AddCommitmentDialog({ month, onClose }: AddCommitmentDialogProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const { data: categories } = useCategories();
  const createCommitment = useCreateFixedCommitment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    await createCommitment.mutateAsync({
      month,
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
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g., Rent, Council Tax"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount">Amount (£)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          placeholder="0.00"
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
        <Button type="submit" disabled={createCommitment.isPending}>
          Add
        </Button>
      </div>
    </form>
  );
}

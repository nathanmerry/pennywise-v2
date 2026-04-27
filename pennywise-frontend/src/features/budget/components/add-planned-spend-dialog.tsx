import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useCreatePlannedSpend } from "@/shared/hooks/use-budget";

interface AddPlannedSpendDialogProps {
  month: string;
  onClose: () => void;
}

export function AddPlannedSpendDialog({ month, onClose }: AddPlannedSpendDialogProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [isEssential, setIsEssential] = useState(false);
  const createPlanned = useCreatePlannedSpend();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    await createPlanned.mutateAsync({
      month,
      data: { name, amount: parseFloat(amount), isEssential },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g., Holiday, Birthday gift"
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
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="essential"
          checked={isEssential}
          onChange={(e) => setIsEssential(e.target.checked)}
          className="rounded"
        />
        <Label htmlFor="essential" className="text-sm font-normal">
          This is essential (not discretionary)
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={createPlanned.isPending}>
          Add
        </Button>
      </div>
    </form>
  );
}

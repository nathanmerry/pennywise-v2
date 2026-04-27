import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { Transaction } from "@/shared/lib/api";

interface EditAmountDialogProps {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (amount: number | null) => void;
}

export function EditAmountDialog({
  transaction,
  open,
  onOpenChange,
  onSave,
}: EditAmountDialogProps) {
  const initial = transaction.updatedTransactionAmount ?? transaction.amount;
  const [value, setValue] = useState(initial);

  const parsed = value.trim() === "" ? NaN : Number(value);
  const isValid = Number.isFinite(parsed);
  const originalAmount = Number(transaction.amount);
  const isOverridden = transaction.updatedTransactionAmount !== null;

  const save = () => {
    if (!isValid) return;
    // If the user typed back the original bank amount, clear the override.
    onSave(parsed === originalAmount ? null : parsed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Amount</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {transaction.merchantName || transaction.description}
          </p>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ({transaction.currency})</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Bank-reported: {originalAmount.toFixed(2)} {transaction.currency}
              {". "}Future syncs will not overwrite your edit.
            </p>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {isOverridden ? (
            <Button
              variant="ghost"
              onClick={() => onSave(null)}
              className="text-muted-foreground"
            >
              Reset to bank amount
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!isValid}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { Account, Category } from "@/shared/lib/api";

const NONE = "__none__";

export interface NewTransactionData {
  description: string;
  amount: number;
  direction: "expense" | "income";
  transactionDate: string;
  accountId: string;
  categoryIds?: string[];
  merchantName?: string | null;
  note?: string | null;
}

interface AddTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  categories: Category[];
  isSaving?: boolean;
  onSave: (data: NewTransactionData) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddTransactionDialog({
  open,
  onOpenChange,
  accounts,
  categories,
  isSaving,
  onSave,
}: AddTransactionDialogProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");

  // Reset the form each time the dialog opens; default to the first account.
  useEffect(() => {
    if (open) {
      setDescription("");
      setAmount("");
      setDirection("expense");
      setDate(today());
      setAccountId(accounts[0]?.id ?? "");
      setCategoryId(NONE);
      setMerchant("");
      setNote("");
    }
  }, [open, accounts]);

  // Flat category options with children shown as "Parent › Child".
  const categoryOptions = useMemo(() => {
    const byName = (a: Category, b: Category) => a.name.localeCompare(b.name);
    const parents = categories.filter((c) => !c.parentId).sort(byName);
    const opts: Array<{ id: string; label: string }> = [];
    for (const p of parents) {
      opts.push({ id: p.id, label: p.name });
      categories
        .filter((c) => c.parentId === p.id)
        .sort(byName)
        .forEach((ch) => opts.push({ id: ch.id, label: `${p.name} › ${ch.name}` }));
    }
    return opts;
  }, [categories]);

  const parsedAmount = amount.trim() === "" ? NaN : Number(amount);
  const isValid =
    description.trim().length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0 && accountId !== "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSave({
      description: description.trim(),
      amount: parsedAmount,
      direction,
      transactionDate: date,
      accountId,
      categoryIds: categoryId !== NONE ? [categoryId] : undefined,
      merchantName: merchant.trim() || null,
      note: note.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              placeholder="e.g. Tesco, Lunch with Sam"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tx-amount">Amount (£)</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "expense" | "income")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.accountName}
                      {a.connection?.institutionName ? ` · ${a.connection.institutionName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Category (optional)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Uncategorised" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Uncategorised</SelectItem>
                {categoryOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-note">Note (optional)</Label>
            <Input
              id="tx-note"
              placeholder="Anything to remember"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSaving}>
              {isSaving ? "Adding…" : "Add transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

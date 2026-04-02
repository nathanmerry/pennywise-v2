import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Transaction, Category } from "../../lib/api";
import { useCreateRule } from "../../hooks/use-rules";

interface CreateRuleDialogProps {
  transaction: Transaction;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRuleDialog({
  transaction,
  categories,
  open,
  onOpenChange,
}: CreateRuleDialogProps) {
  const createRule = useCreateRule();

  const [matchType, setMatchType] = useState<"merchant" | "description">(
    transaction.merchantName ? "merchant" : "description"
  );
  const [matchValue, setMatchValue] = useState(
    transaction.merchantName || transaction.description
  );
  const [categoryId, setCategoryId] = useState<string>("none");
  const [setIgnored, setSetIgnored] = useState(false);
  const [applyToExisting, setApplyToExisting] = useState(true);

  const handleSubmit = () => {
    createRule.mutate(
      {
        matchType,
        matchValue,
        categoryId: categoryId === "none" ? null : categoryId,
        setIgnored: setIgnored ? true : null,
        applyToExisting,
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Recurring Rule</DialogTitle>
          <DialogDescription>
            Automatically categorise or ignore matching transactions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Match type */}
          <div className="space-y-2">
            <Label>Match on</Label>
            <Select value={matchType} onValueChange={(val: string) => setMatchType(val as "merchant" | "description")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merchant" disabled={!transaction.merchantName}>
                  Merchant name
                </SelectItem>
                <SelectItem value="description">Description</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Match value */}
          <div className="space-y-2">
            <Label htmlFor="matchValue">Match value (case-insensitive partial match)</Label>
            <Input
              id="matchValue"
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Assign category</Label>
            <Select value={categoryId} onValueChange={(val: string) => setCategoryId(val)}>
              <SelectTrigger>
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ignore */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="setIgnored"
              checked={setIgnored}
              onCheckedChange={(checked: boolean) => setSetIgnored(checked)}
            />
            <Label htmlFor="setIgnored">Mark matching transactions as ignored</Label>
          </div>

          {/* Apply to existing */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="applyToExisting"
              checked={applyToExisting}
              onCheckedChange={(checked: boolean) => setApplyToExisting(checked)}
            />
            <Label htmlFor="applyToExisting">Apply to existing transactions now</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!matchValue || createRule.isPending}>
            {createRule.isPending ? "Creating..." : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

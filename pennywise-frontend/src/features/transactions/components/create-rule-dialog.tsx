import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { Transaction, Category } from "@/shared/lib/api";
import { useCreateRule } from "@/shared/hooks/use-rules";

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
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [setIgnored, setSetIgnored] = useState(false);
  const [applyToExisting, setApplyToExisting] = useState(true);

  // Build hierarchy
  const { roots, childMap, catMap } = useMemo(() => {
    const roots: Category[] = [];
    const childMap = new Map<string, Category[]>();
    for (const cat of categories) {
      if (!cat.parentId) {
        roots.push(cat);
      } else {
        const siblings = childMap.get(cat.parentId) || [];
        siblings.push(cat);
        childMap.set(cat.parentId, siblings);
      }
    }
    return { roots, childMap, catMap: new Map(categories.map((c) => [c.id, c])) };
  }, [categories]);

  const toggleCat = (id: string) => {
    const next = new Set(selectedCats);
    if (next.has(id)) {
      next.delete(id);
      const children = childMap.get(id) || [];
      for (const child of children) next.delete(child.id);
    } else {
      next.add(id);
      const cat = catMap.get(id);
      if (cat?.parentId && !next.has(cat.parentId)) {
        next.add(cat.parentId);
      }
    }
    setSelectedCats(next);
  };

  const handleSubmit = () => {
    createRule.mutate(
      {
        matchType,
        matchValue,
        categoryIds: selectedCats.size > 0 ? Array.from(selectedCats) : undefined,
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

          {/* Categories (multi-select hierarchical) */}
          <div className="space-y-2">
            <Label>Assign categories</Label>
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
              {roots.map((root) => {
                const children = childMap.get(root.id) || [];
                return (
                  <div key={root.id}>
                    <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer">
                      <Checkbox
                        checked={selectedCats.has(root.id)}
                        onCheckedChange={() => toggleCat(root.id)}
                      />
                      {root.color && (
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: root.color }}
                        />
                      )}
                      <span className="text-sm font-medium">{root.name}</span>
                    </label>
                    {children.map((child) => (
                      <label
                        key={child.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 pl-8 hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedCats.has(child.id)}
                          onCheckedChange={() => toggleCat(child.id)}
                        />
                        {child.color && (
                          <span
                            className="inline-block h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: child.color }}
                          />
                        )}
                        <span className="text-sm">{child.name}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
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

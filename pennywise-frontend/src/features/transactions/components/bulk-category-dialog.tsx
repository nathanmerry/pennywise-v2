import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Search } from "lucide-react";
import type { Category } from "@/shared/lib/api";

interface BulkCategoryDialogProps {
  count: number;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (categoryIds: string[]) => void;
}

export function BulkCategoryDialog({
  count,
  categories,
  open,
  onOpenChange,
  onSave,
}: BulkCategoryDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Build hierarchy: root categories (no parent) with their children
  const { roots, childMap } = useMemo(() => {
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
    return { roots, childMap };
  }, [categories]);

  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      // If unchecking a parent, also uncheck its children
      const children = childMap.get(id) || [];
      for (const child of children) next.delete(child.id);
    } else {
      next.add(id);
      // If checking a child, auto-check parent
      const cat = catMap.get(id);
      if (cat?.parentId && !next.has(cat.parentId)) {
        next.add(cat.parentId);
      }
    }
    setSelected(next);
  };

  const lowerSearch = search.toLowerCase();
  const matchesSearch = (cat: Category) =>
    !search || cat.name.toLowerCase().includes(lowerSearch);

  const handleSave = () => {
    onSave(Array.from(selected));
    setSelected(new Set());
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Category for {count} Transactions</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            This will set the same category on all {count} selected transactions.
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 rounded-md border p-2">
            {roots.map((root) => {
              const children = childMap.get(root.id) || [];
              const rootMatches = matchesSearch(root);
              const matchingChildren = children.filter(matchesSearch);
              if (!rootMatches && matchingChildren.length === 0) return null;

              return (
                <div key={root.id}>
                  <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={selected.has(root.id)}
                      onCheckedChange={() => toggle(root.id)}
                    />
                    {root.color && (
                      <span
                        className="inline-block h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: root.color }}
                      />
                    )}
                    <span className="text-sm font-medium">{root.name}</span>
                  </label>
                  {(rootMatches ? children : matchingChildren).map((child) => (
                    <label
                      key={child.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 pl-8 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(child.id)}
                        onCheckedChange={() => toggle(child.id)}
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Apply to {count} Transactions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

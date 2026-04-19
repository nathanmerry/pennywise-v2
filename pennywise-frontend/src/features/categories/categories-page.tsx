import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@/shared/hooks/use-categories";
import type { Category } from "@/shared/lib/api";

export function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [parentId, setParentId] = useState<string>("none");

  // Build hierarchy
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

  const rootCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories]
  );

  const openCreate = (presetParentId?: string) => {
    setEditing(null);
    setName("");
    setColor("#6366f1");
    setParentId(presetParentId || "none");
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setName(cat.name);
    setColor(cat.color || "#6366f1");
    setParentId(cat.parentId || "none");
    setDialogOpen(true);
  };

  const handleSave = () => {
    const data = { name, color, parentId: parentId === "none" ? null : parentId };
    if (editing) {
      updateCat.mutate(
        { id: editing.id, data },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createCat.mutate(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this category? Transactions will be uncategorised.")) {
      deleteCat.mutate(id);
    }
  };

  const renderCategoryRow = (cat: Category, indent: boolean = false) => (
    <div
      key={cat.id}
      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${indent ? "ml-8" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-4 w-4 rounded-full border shrink-0"
          style={{ backgroundColor: cat.color || "#6366f1" }}
        />
        <span className={indent ? "text-sm" : "font-medium"}>{cat.name}</span>
        {cat._count && (
          <Badge variant="secondary" className="text-xs">
            {cat._count.transactionCategories} transactions
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!indent && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Add subcategory"
            onClick={() => openCreate(cat.id)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={() => handleDelete(cat.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={() => openCreate()}>
          <Plus className="mr-2 h-4 w-4" />
          New Category
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          Loading...
        </div>
      ) : categories.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <p className="text-muted-foreground">No categories yet.</p>
          <Button variant="outline" onClick={() => openCreate()}>
            Create your first category
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {roots.map((root) => {
            const children = childMap.get(root.id) || [];
            return (
              <div key={root.id} className="space-y-1">
                {renderCategoryRow(root)}
                {children.map((child) => renderCategoryRow(child, true))}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Groceries, Transport..."
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-color">Color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="cat-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 rounded border cursor-pointer"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-28 font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Parent category</Label>
              <Select
                value={parentId}
                onValueChange={(val: string) => setParentId(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (top-level)</SelectItem>
                  {rootCategories
                    .filter((c) => c.id !== editing?.id)
                    .map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name || createCat.isPending || updateCat.isPending}
            >
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

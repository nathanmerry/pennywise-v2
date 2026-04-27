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
import { useCreateCategoryPlan } from "@/shared/hooks/use-budget";

interface AddCategoryPlanDialogProps {
  month: string;
  onClose: () => void;
}

export function AddCategoryPlanDialog({ month, onClose }: AddCategoryPlanDialogProps) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [targetValue, setTargetValue] = useState("");
  const [targetType, setTargetType] = useState<"fixed" | "percent">("fixed");
  const { data: categories } = useCategories();
  const createPlan = useCreateCategoryPlan();

  // Only show parent categories (top-level) for budgeting
  const parentCategories = categories?.filter((c) => !c.parentId) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !targetValue) return;

    await createPlan.mutateAsync({
      month,
      data: {
        categoryId,
        targetType,
        targetValue: parseFloat(targetValue),
      },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {parentCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Budget Type</Label>
        <Select value={targetType} onValueChange={(v) => setTargetType(v as "fixed" | "percent")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed Amount (£)</SelectItem>
            <SelectItem value="percent">Percentage of Flexible Budget</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="target">
          {targetType === "fixed" ? "Amount (£)" : "Percentage (%)"}
        </Label>
        <Input
          id="target"
          type="number"
          step={targetType === "fixed" ? "0.01" : "1"}
          placeholder={targetType === "fixed" ? "0.00" : "0"}
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={createPlan.isPending}>
          Add
        </Button>
      </div>
    </form>
  );
}

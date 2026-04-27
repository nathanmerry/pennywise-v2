import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import type { BudgetFixedCommitment } from "@/shared/lib/api";
import { formatCurrency } from "@/features/budget/lib/cycle";
import { EditCommitmentDialog } from "./edit-commitment-dialog";

interface CommitmentRowProps {
  commitment: BudgetFixedCommitment;
  onDelete: () => void;
}

export function CommitmentRow({ commitment, onDelete }: CommitmentRowProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{commitment.name}</span>
        <span className="text-xs text-muted-foreground">
          {commitment.category
            ? `Linked to ${commitment.category.name}`
            : "Not linked to a category"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold">
          {formatCurrency(parseFloat(commitment.amount))}
        </span>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Fixed Commitment</DialogTitle>
            </DialogHeader>
            <EditCommitmentDialog
              commitment={commitment}
              onClose={() => setEditOpen(false)}
            />
          </DialogContent>
        </Dialog>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

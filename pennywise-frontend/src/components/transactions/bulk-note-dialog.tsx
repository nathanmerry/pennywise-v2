import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BulkNoteDialogProps {
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: string) => void;
}

export function BulkNoteDialog({ count, open, onOpenChange, onSave }: BulkNoteDialogProps) {
  const [note, setNote] = useState("");

  const handleSave = () => {
    onSave(note);
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Note to {count} Transactions</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            This will set the same note on all {count} selected transactions.
          </p>
          <div className="space-y-2">
            <Label htmlFor="bulk-note">Note</Label>
            <Input
              id="bulk-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. reimbursed, business expense..."
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Apply to {count} Transactions</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

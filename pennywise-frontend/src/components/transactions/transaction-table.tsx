import { useState } from "react";
import { format } from "date-fns";
import {
  MoreHorizontal,
  EyeOff,
  Eye,
  Tag,
  StickyNote,
  ListFilter,
  Loader2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Transaction, Category } from "../../lib/api";
import { EditNoteDialog } from "./edit-note-dialog";
import { EditCategoryDialog } from "./edit-category-dialog";
import { CreateRuleDialog } from "./create-rule-dialog";

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  onUpdate: (id: string, data: { note?: string | null; categoryIds?: string[] | null; isIgnored?: boolean }) => void;
  isUpdating: boolean;
}

export function TransactionTable({
  transactions,
  categories,
  onUpdate,
  isUpdating,
}: TransactionTableProps) {
  const [noteDialog, setNoteDialog] = useState<Transaction | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<Transaction | null>(null);
  const [ruleDialog, setRuleDialog] = useState<Transaction | null>(null);

  const formatAmount = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(num);
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
              <TableHead className="w-36">Account</TableHead>
              <TableHead className="w-36">Category</TableHead>
              <TableHead className="w-20 text-center">Status</TableHead>
              <TableHead className="w-48">Notes</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => (
                <TableRow
                  key={tx.id}
                  className={cn(tx.isIgnored && "opacity-50")}
                >
                  <TableCell className="text-sm tabular-nums">
                    {format(new Date(tx.transactionDate), "dd MMM yy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {tx.merchantName && (
                        <span className="font-medium text-sm">{tx.merchantName}</span>
                      )}
                      <span className={cn("text-sm", tx.merchantName && "text-muted-foreground text-xs")}>
                        {tx.description}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-sm">
                    <span className={cn(parseFloat(tx.amount) >= 0 ? "text-green-600" : "")}>
                      {formatAmount(tx.amount, tx.currency)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">
                        {tx.account.connection.institutionName}
                      </span>
                      <span className="text-sm">{tx.account.accountName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {tx.categories.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          // Build parent/child display pairs
                          const directCats = tx.categories.filter((c) => c.source !== "inherited");
                          if (directCats.length === 0) return null;
                          return directCats.map((tc) => {
                            const parent = tx.categories.find(
                              (p) => p.categoryId === tc.category.parentId && p.source === "inherited"
                            );
                            const label = parent
                              ? `${parent.category.name} / ${tc.category.name}`
                              : tc.category.name;
                            const color = tc.category.color || parent?.category.color;
                            return (
                              <Badge
                                key={tc.id}
                                variant="secondary"
                                className="text-xs"
                                style={
                                  color
                                    ? { backgroundColor: color + "20", color }
                                    : undefined
                                }
                              >
                                {label}
                              </Badge>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {tx.pending && (
                        <Badge variant="outline" className="text-xs">
                          Pending
                        </Badge>
                      )}
                      {tx.isIgnored && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          <EyeOff className="mr-1 h-3 w-3" />
                          Ignored
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground line-clamp-1">
                      {tx.note || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setCategoryDialog(tx)}>
                          <Tag className="mr-2 h-4 w-4" />
                          Edit category
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setNoteDialog(tx)}>
                          <StickyNote className="mr-2 h-4 w-4" />
                          {tx.note ? "Edit note" : "Add note"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onUpdate(tx.id, { isIgnored: !tx.isIgnored })}
                        >
                          {tx.isIgnored ? (
                            <>
                              <Eye className="mr-2 h-4 w-4" />
                              Unignore
                            </>
                          ) : (
                            <>
                              <EyeOff className="mr-2 h-4 w-4" />
                              Ignore
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setRuleDialog(tx)}>
                          <ListFilter className="mr-2 h-4 w-4" />
                          Create rule from this
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {noteDialog && (
        <EditNoteDialog
          transaction={noteDialog}
          open={!!noteDialog}
          onOpenChange={(open: boolean) => !open && setNoteDialog(null)}
          onSave={(note: string) => {
            onUpdate(noteDialog.id, { note: note || null });
            setNoteDialog(null);
          }}
        />
      )}

      {categoryDialog && (
        <EditCategoryDialog
          transaction={categoryDialog}
          categories={categories}
          open={!!categoryDialog}
          onOpenChange={(open: boolean) => !open && setCategoryDialog(null)}
          onSave={(categoryIds: string[]) => {
            onUpdate(categoryDialog.id, { categoryIds: categoryIds.length > 0 ? categoryIds : null });
            setCategoryDialog(null);
          }}
        />
      )}

      {ruleDialog && (
        <CreateRuleDialog
          transaction={ruleDialog}
          categories={categories}
          open={!!ruleDialog}
          onOpenChange={(open: boolean) => !open && setRuleDialog(null)}
        />
      )}
    </>
  );
}

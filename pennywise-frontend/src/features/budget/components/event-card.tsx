import { useState } from "react";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { useDeleteBudgetEvent } from "@/shared/hooks/use-budget";
import type { BudgetEvent } from "@/shared/lib/api";
import { formatCurrency, formatDateRange, isoDateOnly } from "@/features/budget/lib/cycle";
import { EditEventDialog } from "./edit-event-dialog";
import { EventPotRow } from "./event-pot-row";

interface EventCardProps {
  event: BudgetEvent;
  /** Cycle bounds (ISO) — used to flag events dated outside the cycle. */
  cycleStart?: string;
  cycleEnd?: string;
}

const fundingLabels: Record<BudgetEvent["fundingSource"], string> = {
  flexible: "Counts against this cycle's flexible budget",
  savings: "Funded from savings",
  external: "Funded externally",
};

export function EventCard({ event, cycleStart, cycleEnd }: EventCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const deleteEvent = useDeleteBudgetEvent();

  const cap = parseFloat(event.cap);
  const outOfCycle = Boolean(
    cycleStart &&
      cycleEnd &&
      (isoDateOnly(event.startDate) < isoDateOnly(cycleStart) ||
        isoDateOnly(event.endDate) > isoDateOnly(cycleEnd)),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{event.name}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDateRange(event.startDate, event.endDate)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Sheet open={editOpen} onOpenChange={setEditOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Edit Event</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                <EditEventDialog
                  event={event}
                  cycleStart={cycleStart}
                  cycleEnd={cycleEnd}
                  onClose={() => setEditOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => deleteEvent.mutate(event.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {outOfCycle && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              These dates fall outside this cycle
              {cycleStart && cycleEnd
                ? ` (${formatDateRange(cycleStart, cycleEnd)})`
                : ""}
              , yet the cap is still reserved from this cycle&apos;s flexible
              budget. Delete it here and re-add it under the cycle it belongs to.
            </span>
          </div>
        )}
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Cap reserved</span>
            <span className="tabular-nums font-semibold">{formatCurrency(cap)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fundingLabels[event.fundingSource]}
          </p>
        </div>

        {event.pots.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pots
            </p>
            {event.pots.map((pot) => (
              <EventPotRow key={pot.id} pot={pot} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Progress } from "@/shared/components/ui/progress";
import { useEventsForMonth } from "@/shared/hooks/use-budget";
import { cn } from "@/shared/lib/utils";
import type { BudgetEventWithSpend } from "@/shared/lib/api";
import { formatDateRange } from "@/features/budget/lib/cycle";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

type EventState = "upcoming" | "active" | "finished";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getEventState(event: BudgetEventWithSpend, today: Date): EventState {
  const start = startOfLocalDay(new Date(event.startDate));
  const end = startOfLocalDay(new Date(event.endDate));
  const t = startOfLocalDay(today);
  if (t.getTime() < start.getTime()) return "upcoming";
  if (t.getTime() > end.getTime()) return "finished";
  return "active";
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / MS_PER_DAY);
}

function priorityRank(state: EventState): number {
  if (state === "active") return 0;
  if (state === "upcoming") return 1;
  return 2;
}

interface EventsSummaryCardProps {
  month: string;
}

export function EventsSummaryCard({ month }: EventsSummaryCardProps) {
  const { data: events } = useEventsForMonth(month);
  if (!events || events.length === 0) return null;

  const today = new Date();
  const ranked = [...events]
    .map((e) => ({ event: e, state: getEventState(e, today) }))
    .sort((a, b) => {
      const rankDiff = priorityRank(a.state) - priorityRank(b.state);
      if (rankDiff !== 0) return rankDiff;
      // Within same state: active/upcoming sort by start asc; finished sort by end desc.
      if (a.state === "finished") {
        return b.event.endDate.localeCompare(a.event.endDate);
      }
      return a.event.startDate.localeCompare(b.event.startDate);
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Events affecting this cycle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ranked.map(({ event, state }) => (
          <EventRow key={event.id} event={event} state={state} today={today} />
        ))}
      </CardContent>
    </Card>
  );
}

function EventRow({
  event,
  state,
  today,
}: {
  event: BudgetEventWithSpend;
  state: EventState;
  today: Date;
}) {
  const cap = event.cap;
  const spent = event.actualSpend;
  const remaining = cap - spent;
  const isOver = spent > cap;
  const percent = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{event.name}</div>
          <div className="text-xs text-muted-foreground">
            {formatDateRange(event.startDate, event.endDate)}
          </div>
        </div>
        <StateBadge state={state} />
      </div>

      <Progress
        value={percent}
        className={cn("h-1.5", isOver && "*:data-[slot=progress-indicator]:bg-destructive")}
      />

      <div className="text-xs text-muted-foreground tabular-nums">
        {state === "upcoming" && (
          <UpcomingDetail event={event} today={today} />
        )}
        {state === "active" && (
          <ActiveDetail event={event} today={today} spent={spent} remaining={remaining} />
        )}
        {state === "finished" && (
          <FinishedDetail spent={spent} cap={cap} remaining={remaining} />
        )}
      </div>

      {event.pots.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-muted pl-3">
          {event.pots.map((pot) => (
            <PotLine key={pot.id} pot={pot} state={state} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PotLine({
  pot,
  state,
}: {
  pot: BudgetEventWithSpend["pots"][number];
  state: EventState;
}) {
  const allocated = pot.amount;
  // Pot tracking only meaningful when (a) the pot is bound to a category and
  // (b) the event has actually started — otherwise show allocation only.
  const showSpend = pot.actualSpend !== null && state !== "upcoming";
  const spent = pot.actualSpend ?? 0;
  const isOver = showSpend && spent > allocated;

  return (
    <li className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground truncate min-w-0">
        {pot.name}
        {pot.category && (
          <span className="text-muted-foreground/70"> · {pot.category.name}</span>
        )}
      </span>
      <span
        className={cn(
          "tabular-nums shrink-0",
          isOver ? "text-destructive" : "text-foreground/80"
        )}
      >
        {showSpend
          ? `${formatCurrency(spent)} / ${formatCurrency(allocated)}`
          : formatCurrency(allocated)}
      </span>
    </li>
  );
}

function StateBadge({ state }: { state: EventState }) {
  const label = state === "upcoming" ? "Upcoming" : state === "active" ? "Active" : "Finished";
  const variant =
    state === "active"
      ? "bg-primary/10 text-primary"
      : state === "upcoming"
        ? "bg-muted text-foreground/80"
        : "bg-muted/50 text-muted-foreground";
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0", variant)}>
      {label}
    </span>
  );
}

function UpcomingDetail({ event, today }: { event: BudgetEventWithSpend; today: Date }) {
  const days = daysBetween(today, new Date(event.startDate));
  return (
    <span>
      Reserved {formatCurrency(event.cap)} from flexible budget · starts in {days}{" "}
      {days === 1 ? "day" : "days"}
    </span>
  );
}

function ActiveDetail({
  event,
  today,
  spent,
  remaining,
}: {
  event: BudgetEventWithSpend;
  today: Date;
  spent: number;
  remaining: number;
}) {
  const end = new Date(event.endDate);
  const daysLeft = Math.max(0, daysBetween(today, end) + 1); // inclusive of today
  const safePerDay = daysLeft > 0 ? remaining / daysLeft : remaining;
  const isOver = remaining < 0;
  return (
    <span className={cn(isOver && "text-destructive")}>
      {formatCurrency(spent)} of {formatCurrency(event.cap)} ·{" "}
      {isOver
        ? `${formatCurrency(Math.abs(remaining))} over`
        : `${formatCurrency(remaining)} left · ${formatCurrency(safePerDay)}/day`}
    </span>
  );
}

function FinishedDetail({
  spent,
  cap,
  remaining,
}: {
  spent: number;
  cap: number;
  remaining: number;
}) {
  const isOver = remaining < 0;
  return (
    <span className={cn(isOver && "text-destructive")}>
      Finished {formatCurrency(spent)} of {formatCurrency(cap)} ·{" "}
      {isOver
        ? `${formatCurrency(Math.abs(remaining))} over`
        : `${formatCurrency(remaining)} under`}
    </span>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface CycleNavProps {
  cycleHeading: string;
  cycleSubheading: string | null;
  isOnActive: boolean;
  activeMonthKey: string | null;
  prevMonth: string | null;
  nextMonth: string | null;
  nextIsProjected: boolean;
  onJump: (month: string) => void;
  rightSlot?: React.ReactNode;
}

export function CycleNav({
  cycleHeading,
  cycleSubheading,
  isOnActive,
  activeMonthKey,
  prevMonth,
  nextMonth,
  nextIsProjected,
  onJump,
  rightSlot,
}: CycleNavProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Budget Keeper</h1>
        <p className="text-muted-foreground">
          {cycleHeading}
          {cycleSubheading && (
            <span className="text-muted-foreground/80"> · {cycleSubheading}</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!prevMonth}
          onClick={() => prevMonth && onJump(prevMonth)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button
          variant={isOnActive ? "secondary" : "outline"}
          size="sm"
          disabled={!activeMonthKey || isOnActive}
          onClick={() => activeMonthKey && onJump(activeMonthKey)}
        >
          Current
        </Button>
        <Button
          variant={nextIsProjected ? "default" : "outline"}
          size="sm"
          disabled={!nextMonth}
          onClick={() => nextMonth && onJump(nextMonth)}
        >
          {nextIsProjected ? "Start Next Cycle" : "Next"}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        {rightSlot}
      </div>
    </div>
  );
}

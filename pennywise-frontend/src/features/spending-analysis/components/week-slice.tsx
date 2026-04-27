import { format } from "date-fns";
import { cn } from "@/shared/lib/utils";
import type { CycleWeek } from "../lib/spending-filters";

interface WeekSliceProps {
  periodLabel: string;
  presetLabel: string;
  weeks: CycleWeek[];
  selectedWeekIndex: number | null;
  onSelect: (index: number | null) => void;
}

function formatWeekRange(week: CycleWeek): string {
  const sameMonth =
    week.start.getFullYear() === week.end.getFullYear() &&
    week.start.getMonth() === week.end.getMonth();
  if (sameMonth) {
    return `${format(week.start, "d")}–${format(week.end, "d MMM")}`;
  }
  return `${format(week.start, "d MMM")} – ${format(week.end, "d MMM")}`;
}

export function WeekSlice({
  periodLabel,
  presetLabel,
  weeks,
  selectedWeekIndex,
  onSelect,
}: WeekSliceProps) {
  const selectedWeek =
    selectedWeekIndex !== null ? weeks[selectedWeekIndex] ?? null : null;

  const contextLine = selectedWeek
    ? `Week ${selectedWeek.index + 1} · ${formatWeekRange(selectedWeek)}`
    : `${periodLabel} · ${presetLabel}`;

  return (
    <div className='space-y-2'>
      <p className='text-sm text-muted-foreground'>{contextLine}</p>

      {weeks.length > 0 && (
        <div className='-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          <WeekChip
            active={selectedWeekIndex === null}
            label='All weeks'
            onClick={() => onSelect(null)}
          />
          {weeks.map((week) => (
            <WeekChip
              key={week.index}
              active={selectedWeekIndex === week.index}
              label={week.label}
              onClick={() => onSelect(week.index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

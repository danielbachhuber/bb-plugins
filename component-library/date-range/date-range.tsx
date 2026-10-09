// A button that opens a calendar to pick two dates, for a page whose presets
// do not cover the span someone has in mind. It reports whole days: the start
// of the first and the start of the day after the last, so the last day is
// included without the caller doing date arithmetic.
import { useEffect, useRef, useState } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";

import { cn } from "../lib/cn";
import { Calendar } from "../calendar/calendar";

export interface DayRange {
  /** Inclusive, epoch ms, at midnight local. */
  from: number;
  /** Exclusive, epoch ms, at midnight local. */
  to: number;
}

const startOfDay = (at: number | Date): Date => {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day;
};

const dayAfter = (at: Date): Date => {
  const day = startOfDay(at);
  day.setDate(day.getDate() + 1);
  return day;
};

const asDraft = (value: DayRange | null): DayPickerRange | undefined => {
  if (value === null) return undefined;
  const last = new Date(value.to);
  last.setDate(last.getDate() - 1);
  return { from: new Date(value.from), to: last };
};

const label = (at: number): string => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** How the button reads: the dates when some are chosen, the placeholder otherwise. */
export function dayRangeLabel(value: DayRange | null, placeholder: string): string {
  if (value === null) return placeholder;
  const last = new Date(value.to);
  last.setDate(last.getDate() - 1);
  return `${label(value.from)} to ${label(last.getTime())}`;
}

export function DateRange({
  value,
  onChange,
  placeholder = "Custom",
  earliest,
  latest,
  className,
  defaultOpen = false,
}: {
  value: DayRange | null;
  onChange: (value: DayRange) => void;
  /** What the button says when no range is chosen. */
  placeholder?: string;
  /** The first day there is anything to read, if the data does not go back forever. */
  earliest?: number;
  /** The last day worth offering, normally today. */
  latest?: number;
  className?: string;
  /** Starts with the calendar open, for a story. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<DayPickerRange | undefined>(() => asDraft(value));
  const root = useRef<HTMLDivElement>(null);

  // The draft starts from whatever is applied, so reopening shows the current
  // range rather than an empty calendar.
  useEffect(() => {
    if (open) setDraft(asDraft(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = () => {
    if (draft?.from === undefined) return;
    const last = draft.to ?? draft.from;
    onChange({ from: startOfDay(draft.from).getTime(), to: dayAfter(last).getTime() });
    setOpen(false);
  };

  return (
    <div ref={root} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground",
          value !== null && "bg-muted font-medium text-foreground",
        )}
      >
        {dayRangeLabel(value, placeholder)}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date range"
          data-slot="popover-content"
          className="absolute right-0 z-50 mt-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={draft?.from ?? (latest === undefined ? undefined : new Date(latest))}
            selected={draft}
            onSelect={setDraft}
            disabled={[
              ...(earliest === undefined ? [] : [{ before: startOfDay(earliest) }]),
              ...(latest === undefined ? [] : [{ after: startOfDay(latest) }]),
            ]}
          />
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {draft?.from === undefined ? "Pick the first day" : dayRangeLabel(
                { from: startOfDay(draft.from).getTime(), to: dayAfter(draft.to ?? draft.from).getTime() },
                "",
              )}
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded px-2 py-1 text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={draft?.from === undefined}
                className="cursor-pointer rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Apply
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

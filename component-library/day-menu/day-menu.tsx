// The inside of a "pick a later day" popover, as Now's Postpone draws it: a
// line saying what moves, a few quick days, a box for any day typed in words,
// and an optional note under them. The plugin keeps its own popover and the
// button that opens it, since bb's popover is vendored into each plugin; this
// draws what goes inside, and remounts with an empty box each time it opens.
import { useState, type ReactNode } from "react";

import { cn } from "../lib/cn";
import { parseDay } from "./parse-day";

export { addDaysTo, describeDay, localDay, nextMonday, parseDay, type ParsedDay } from "./parse-day";

export interface DayChoice {
  /** What the choice is called: "Tomorrow", "A week later". */
  label: string;
  /** `YYYY-MM-DD`. */
  day: string;
}

export interface DayMenuProps {
  /** The line at the top saying what moves: "Snooze until". Left out, there is none. */
  heading?: ReactNode;
  choices: DayChoice[];
  /** The day in words, drawn beside a choice whose label says something else, and beside the typed text. */
  describe: (day: string) => string;
  /** Null when the day can be picked, else why not, drawn beside the typed text: "Too early". */
  check?: (day: string) => string | null;
  onPick: (day: string) => void;
  /** "Today", for reading the typed words. */
  now: Date;
  /** The menu's name for assistive technology: "Snooze until". */
  menuLabel: string;
  /** The box's name for assistive technology: "Snooze until a day". */
  inputLabel: string;
  placeholder?: string;
  /** Drawn under a line at the bottom, such as what the pick leaves alone. */
  footer?: ReactNode;
}

export function DayMenu({
  heading,
  choices,
  describe,
  check = () => null,
  onPick,
  now,
  menuLabel,
  inputLabel,
  placeholder = 'Or type a day: "fri", "oct 8"',
  footer,
}: DayMenuProps) {
  const [text, setText] = useState("");
  const typed = parseDay(text, now);
  const typedDay = typeof typed === "string" ? typed : null;
  const problem = typedDay === null ? "Not a date" : check(typedDay);
  const typedOk = typedDay !== null && problem === null;

  return (
    <>
      {heading ? <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">{heading}</p> : null}
      <div role="menu" aria-label={menuLabel}>
        {choices.map((choice) => {
          // "Tomorrow" beside "Tomorrow" says it twice.
          const date = describe(choice.day);
          return (
            <button
              key={choice.day}
              type="button"
              role="menuitem"
              onClick={() => onPick(choice.day)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className="flex-1">{choice.label}</span>
              {date === choice.label ? null : <span className="text-xs tabular-nums text-muted-foreground">{date}</span>}
            </button>
          );
        })}
      </div>
      <form
        className="relative px-1 pb-1 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (typedOk) onPick(typedDay);
        }}
      >
        <input
          autoFocus
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          aria-label={inputLabel}
          aria-invalid={(text.trim() !== "" && !typedOk) || undefined}
          className={cn(
            "flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            text.trim() !== "" && "pr-24",
          )}
        />
        {text.trim() === "" ? null : (
          <span
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums",
              typedOk ? "text-muted-foreground" : "text-destructive-text",
            )}
          >
            {typedOk ? describe(typedDay) : problem}
          </span>
        )}
      </form>
      {footer ? (
        <p className="flex items-center gap-1.5 border-t border-border px-2 pb-1 pt-2 text-[11px] text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </>
  );
}

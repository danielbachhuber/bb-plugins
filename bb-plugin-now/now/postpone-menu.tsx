// Postpone on a Todoist row: a menu of later days. On a recurring task it moves
// only the current occurrence, so the task keeps repeating; on a one-off task
// it moves the due date or deadline that has come. Draws only. The menu's
// inside is component-library's DayMenu, which Review Sweep's Snooze shares.
import { useState } from "react";
import { DayMenu } from "@danielbachhuber/bb-plugin-component-library/day-menu";

import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { canPostponeTo, dueDay, movedDate, postponeChoices, type PostponeTarget } from "../todoist/postpone.js";
import { describeDue } from "./due.js";
import type { Due } from "./types.js";

/** A day in the row's own words, with the task's time when it has one: "Tuesday 09:00". */
function when(due: Due, day: string, now: Date): string {
  return describeDue({ date: movedDate(due.date, day), recurring: false }, now).text;
}

export function PostponeMenu({
  target,
  now,
  disabled,
  working,
  onPostpone,
  defaultOpen = false,
}: {
  target: PostponeTarget;
  now: Date;
  disabled: boolean;
  /** The postpone is running. */
  working: boolean;
  onPostpone: (day: string) => void;
  /** Starts open, for a story. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const due = target.due;

  if (working) {
    return (
      <span className="-mx-1 inline-flex items-center gap-1 px-1 text-foreground" role="status">
        <Icon name="Loading" className="size-3 animate-spin" />
        Postponing…
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
            open && "bg-accent text-foreground",
          )}
        >
          <Icon name="Pause" className="size-3" />
          Postpone
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1" mobileTitle="Postpone">
        <DayMenu
          heading={
            <>
              Postpone {target.kind === "deadline" ? "the deadline " : ""}
              {when(due, dueDay(due.date), now)} to
            </>
          }
          choices={postponeChoices(due, now)}
          describe={(day) => when(due, day, now)}
          check={(day) => (canPostponeTo(due, day, now) ? null : "Too early")}
          onPick={(day) => {
            setOpen(false);
            onPostpone(day);
          }}
          now={now}
          menuLabel="Postpone to"
          inputLabel="Postpone to a day"
          footer={
            target.kind === "occurrence" ? (
              <>
                <Icon name="Repeat" className="size-3" />
                Still repeats {target.due.text}
              </>
            ) : target.kind === "deadline" ? (
              <>
                <Icon name="Target" className="size-3" />
                Moves the deadline only.
              </>
            ) : null
          }
        />
      </PopoverContent>
    </Popover>
  );
}

// Postpone on a recurring Todoist row: a menu of later days that moves only
// the current occurrence, so the task keeps repeating. Draws only.
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { parseDeadline } from "../todoist/deadline.js";
import { canPostponeTo, dueDay, movedDate, postponeChoices } from "../todoist/postpone.js";
import { describeDue } from "./due.js";
import type { Due } from "./types.js";

/** A day in the row's own words, with the task's time when it has one: "Tuesday 09:00". */
function when(due: Due, day: string, now: Date): string {
  return describeDue({ date: movedDate(due.date, day), recurring: false }, now).text;
}

export function PostponeMenu({
  due,
  now,
  disabled,
  working,
  onPostpone,
  defaultOpen = false,
}: {
  due: Due & { text: string };
  now: Date;
  disabled: boolean;
  /** The postpone is running. */
  working: boolean;
  onPostpone: (day: string) => void;
  /** Starts open, for a story. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const typed = parseDeadline(text, now);
  const typedDay = typeof typed === "string" ? typed : null;
  const typedOk = typedDay !== null && canPostponeTo(due, typedDay, now);

  const choose = (day: string) => {
    setOpen(false);
    onPostpone(day);
  };

  if (working) {
    return (
      <span className="-mx-1 inline-flex items-center gap-1 px-1 text-foreground" role="status">
        <Icon name="Loading" className="size-3 animate-spin" />
        Postponing…
      </span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setText("");
      }}
    >
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
          <Icon name="Clock" className="size-3" />
          Postpone
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1" mobileTitle="Postpone">
        <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
          Postpone {when(due, dueDay(due.date), now)} to
        </p>
        <div role="menu" aria-label="Postpone to">
          {postponeChoices(due, now).map((choice) => (
            <button
              key={choice.day}
              type="button"
              role="menuitem"
              onClick={() => choose(choice.day)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className="flex-1">{choice.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{when(due, choice.day, now)}</span>
            </button>
          ))}
        </div>
        <form
          className="relative px-1 pb-1 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (typedOk) choose(typedDay);
          }}
        >
          <Input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder='Or type a day: "fri", "oct 8"'
            aria-label="Postpone to a day"
            aria-invalid={(text.trim() !== "" && !typedOk) || undefined}
            className={cn("h-8 text-sm", text.trim() !== "" && "pr-24")}
          />
          {text.trim() === "" ? null : (
            <span
              className={cn(
                "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums",
                typedOk ? "text-muted-foreground" : "text-destructive-text",
              )}
            >
              {typedDay === null ? "Not a date" : typedOk ? when(due, typedDay, now) : "Too early"}
            </span>
          )}
        </form>
        <p className="flex items-center gap-1.5 border-t border-border px-2 pb-1 pt-2 text-[11px] text-muted-foreground">
          <Icon name="Repeat" className="size-3" />
          Still repeats {due.text}
        </p>
      </PopoverContent>
    </Popover>
  );
}

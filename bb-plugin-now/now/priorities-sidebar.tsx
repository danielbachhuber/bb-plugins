// The week's priorities in bb's sidebar, on every page: one line saying how
// many there are, with a ring for how many are done, which opens to each
// priority with its checkbox, its nested bullets, and a button to start a
// thread about it. Draws only; the slot loads the week, saves a check, and
// starts the thread.
import type * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import {
  countLabel,
  doneCount,
  hoursAsOf,
  hoursLabel,
  priorityThreadId,
  progressLabel,
  weekLabel,
  type PriorityDetail,
  type PriorityWeek,
  type StoredPriority,
} from "./priorities.js";

export interface PrioritiesSidebarProps {
  /** This week's priorities, or null when none have been written. */
  week: PriorityWeek | null;
  now: Date;
  /** Whether the list is showing, below the one-line summary. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (text: string, done: boolean) => void;
  /** Thread ids by the id they were started under, as the page's listing has them. */
  threads?: Readonly<Record<string, string>>;
  /** Left out, the list draws no thread buttons. */
  onStartThread?: (priority: StoredPriority) => void;
  onOpenThread?: (threadId: string) => void;
}

/** Nothing at all for a week with no priorities. */
export function PrioritiesSidebar({
  week,
  now,
  open,
  onOpenChange,
  onToggle,
  threads = {},
  onStartThread,
  onOpenThread,
}: PrioritiesSidebarProps) {
  if (week === null || week.items.length === 0) return null;
  // Said only when some priority has hours, since it dates them.
  const asOf = week.items.some((each) => each.hours !== null) ? hoursAsOf(week.hoursAt, now) : null;
  const listId = `now-priorities-${week.monday}`;
  return (
    <section aria-label="Priorities" title={week.heading ?? undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        title={`${weekLabel(week.monday)}. ${open ? "Hide" : "Show"} the priorities.`}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Donut done={doneCount(week.items)} total={week.items.length} label={progressLabel(week.items)} />
        <span className="min-w-0 flex-1 truncate text-foreground">{countLabel(week.items)}</span>
        <Icon name={open ? "ChevronDown" : "ChevronUp"} className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div id={listId} className="border-t border-sidebar-border px-3 pb-3 pt-2.5">
          <ul className="space-y-2.5">
            {week.items.map((priority, index) => {
              const id = `now-priority-${index}`;
              const done = priority.doneAt !== null;
              const hours = hoursLabel(priority.hours);
              return (
                <li key={priority.text} className="flex gap-2 text-xs leading-4">
                  <Checkbox
                    id={id}
                    className="mt-px size-3.5"
                    checked={done}
                    onCheckedChange={(checked) => onToggle(priority.text, checked === true)}
                  />
                  <div className="min-w-0">
                    <label htmlFor={id} className={cn("cursor-pointer break-words", done ? "text-muted-foreground line-through" : "text-foreground")}>
                      {priority.text}
                    </label>
                    {onStartThread === undefined ? null : (
                      <ThreadButton
                        text={priority.text}
                        threadId={threads[priorityThreadId(week.monday, priority.text)] ?? null}
                        onStart={() => onStartThread(priority)}
                        onOpen={(threadId) => onOpenThread?.(threadId)}
                      />
                    )}
                    <Details details={priority.details} />
                    {hours === null ? null : (
                      <div
                        className={cn(
                          "mt-0.5 tabular-nums",
                          priority.hours === 0 && !done ? "text-[#b07800] dark:text-[#eda100]" : "text-muted-foreground",
                        )}
                      >
                        {hours}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {asOf === null ? null : <p className="mt-2.5 text-xs text-muted-foreground">{asOf}</p>}
        </div>
      ) : null}
    </section>
  );
}

/** A ring filled by the share of priorities checked off, "1 of 5 done" on hover and to a screen reader. */
function Donut({ done, total, label }: { done: number; total: number; label: string }) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 -rotate-90" role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx="8" cy="8" r={radius} fill="none" strokeWidth="3" className="stroke-muted-foreground/30" />
      {done === 0 ? null : (
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeDasharray={`${(done / total) * circumference} ${circumference}`}
          className="stroke-[#1baf7a] dark:stroke-[#199e70]"
        />
      )}
    </svg>
  );
}

/**
 * A small button after a priority's text: Start thread, or Open thread for a
 * priority a thread was started from on the Now page before the list moved
 * here. Inline, so it follows the last word.
 */
function ThreadButton({
  text,
  threadId,
  onStart,
  onOpen,
}: {
  text: string;
  threadId: string | null;
  onStart: () => void;
  onOpen: (threadId: string) => void;
}) {
  const label = threadId === null ? "Start thread" : "Open thread";
  return (
    <button
      type="button"
      title={label}
      aria-label={`${label}: ${text}`}
      className="-my-1 ml-1 inline-flex size-4 items-center justify-center rounded align-middle text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => (threadId === null ? onStart() : onOpen(threadId))}
    >
      <Icon name={threadId === null ? "MessageSquarePlus" : "MessageSquare"} className="size-3" />
    </button>
  );
}

/**
 * The bullets nested under a priority, as a list that keeps the journal's
 * levels: each deeper level indented, with a hanging marker so a wrapped line
 * lines up under its own text.
 */
function Details({ details }: { details: readonly PriorityDetail[] }) {
  if (details.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-muted-foreground">
      {details.map((detail, at) => (
        <li key={at} className="flex gap-1.5" style={{ paddingLeft: `${(detail.depth - 1) * 0.875}rem` } as React.CSSProperties}>
          <span aria-hidden className="shrink-0 select-none">
            {detail.depth === 1 ? "•" : "◦"}
          </span>
          <span className="min-w-0 break-words">{detail.text}</span>
        </li>
      ))}
    </ul>
  );
}

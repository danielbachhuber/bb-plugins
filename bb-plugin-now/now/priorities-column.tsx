// The week's priorities beside the list: each with a checkbox, its nested
// bullets, and the hours it has had this week. Draws only; the page loads
// the week and saves a check.
import { useRef, useState } from "react";
import type * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import {
  clampColumnWidth,
  COLUMN_WIDTH,
  doneCount,
  hoursAsOf,
  hoursLabel,
  priorityThreadId,
  weekLabel,
  type PriorityDetail,
  type PriorityWeek,
  type StoredPriority,
} from "./priorities.js";

export interface PrioritiesColumnProps {
  /** This week's priorities, or null when none have been written. */
  week: PriorityWeek | null;
  now: Date;
  onToggle: (text: string, done: boolean) => void;
  /** Thread ids by the id they were started under, as the page's listing has them. */
  threads?: Readonly<Record<string, string>>;
  /** Left out, the column draws no thread buttons. */
  onStartThread?: (priority: StoredPriority) => void;
  onOpenThread?: (threadId: string) => void;
}

/** Nothing at all for a week with no priorities, so the list keeps the full width. */
export function PrioritiesColumn({ week, now, onToggle, threads = {}, onStartThread, onOpenThread }: PrioritiesColumnProps) {
  if (week === null || week.items.length === 0) return null;
  // Said only when some priority has hours, since it dates them.
  const asOf = week.items.some((each) => each.hours !== null) ? hoursAsOf(week.hoursAt, now) : null;
  return (
    <section aria-label="Priorities" title={week.heading ?? undefined}>
      <h2 className="text-xs font-medium text-foreground">Priorities</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
        {weekLabel(week.monday)} · {doneCount(week.items)} of {week.items.length} done
        {asOf === null ? null : <span className="block">{asOf}</span>}
      </p>
      <ol className="space-y-3">
        {week.items.map((priority, index) => {
          const id = `now-priority-${index}`;
          const done = priority.doneAt !== null;
          const hours = hoursLabel(priority.hours);
          return (
            <li key={priority.text} className="flex gap-2 text-sm">
              <Checkbox id={id} className="mt-0.5" checked={done} onCheckedChange={(checked) => onToggle(priority.text, checked === true)} />
              <div className="min-w-0">
                <label htmlFor={id} className={cn("cursor-pointer break-words", done && "text-muted-foreground line-through")}>
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
                      "mt-0.5 text-xs tabular-nums",
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
      </ol>
    </section>
  );
}

/**
 * A small button after a priority's text: Start thread, or Open thread once
 * one has been started from it. Inline, so it follows the last word.
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
      className="-my-1 ml-1 inline-flex size-5 items-center justify-center rounded align-middle text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => (threadId === null ? onStart() : onOpen(threadId))}
    >
      <Icon name={threadId === null ? "MessageSquarePlus" : "MessageSquare"} className="size-3.5" />
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
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {details.map((detail, at) => (
        <li key={at} className="flex gap-1.5" style={{ paddingLeft: `${(detail.depth - 1) * 0.875}rem` }}>
          <span aria-hidden className="shrink-0 select-none">
            {detail.depth === 1 ? "•" : "◦"}
          </span>
          <span className="min-w-0 break-words">{detail.text}</span>
        </li>
      ))}
    </ul>
  );
}

const WIDTH_KEY = "bb-plugin-now:priorities-width";

function storedWidth(): number {
  try {
    return clampColumnWidth(window.localStorage.getItem(WIDTH_KEY) ?? COLUMN_WIDTH.initial);
  } catch {
    return COLUMN_WIDTH.initial;
  }
}

function rememberWidth(width: number): void {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // A storage-blocked tab keeps the width until it closes.
  }
}

/**
 * The page's layout around the list. On a wide page the priorities sit in a
 * column to the right, kept in view while the list scrolls, and dragging its
 * left edge changes its width, remembered across visits. Double-clicking the
 * edge puts the width back. On a narrow page they sit above the list.
 */
export function WithPriorities({
  priorities,
  children,
  initialWidth,
}: {
  priorities: React.ReactNode;
  children: React.ReactNode;
  /** For stories; the page reads the remembered width. */
  initialWidth?: number;
}) {
  const [width, setWidth] = useState(() => initialWidth ?? storedWidth());
  const drag = useRef<{ x: number; width: number } | null>(null);

  const resize = (next: number) => {
    const clamped = clampColumnWidth(next);
    setWidth(clamped);
    rememberWidth(clamped);
  };

  if (priorities === null) return <>{children}</>;
  return (
    <div className="@container">
      <div className="flex flex-col @4xl:flex-row-reverse @4xl:items-start">
        <aside
          className="relative border-b border-border px-4 pb-3 pt-3 md:px-5 md:pt-4 @4xl:sticky @4xl:top-0 @4xl:w-[var(--priorities-width)] @4xl:shrink-0 @4xl:border-b-0 @4xl:border-l @4xl:px-4 @4xl:pb-4"
          style={{ "--priorities-width": `${width}px` } as React.CSSProperties}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize priorities"
            aria-valuemin={COLUMN_WIDTH.min}
            aria-valuemax={COLUMN_WIDTH.max}
            aria-valuenow={width}
            tabIndex={0}
            title="Drag to resize. Double-click to reset."
            className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none outline-none transition-colors hover:bg-border focus-visible:bg-ring/40 @4xl:block"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, width };
            }}
            onPointerMove={(event) => {
              // The column is on the right, so dragging left widens it.
              if (drag.current !== null) setWidth(clampColumnWidth(drag.current.width + drag.current.x - event.clientX));
            }}
            onPointerUp={() => {
              if (drag.current === null) return;
              drag.current = null;
              rememberWidth(width);
            }}
            onDoubleClick={() => resize(COLUMN_WIDTH.initial)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") resize(width + COLUMN_WIDTH.step);
              else if (event.key === "ArrowRight") resize(width - COLUMN_WIDTH.step);
              else return;
              event.preventDefault();
            }}
          />
          {priorities}
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

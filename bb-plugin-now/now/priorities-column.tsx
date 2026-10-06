// The week's priorities beside the list: each with a checkbox, its nested
// bullets, and the hours it has had this week. Draws only; the page loads
// the week and saves a check.
import type * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { doneCount, hoursAsOf, hoursLabel, weekLabel, type PriorityWeek } from "./priorities.js";

export interface PrioritiesColumnProps {
  /** This week's priorities, or null when none have been written. */
  week: PriorityWeek | null;
  now: Date;
  onToggle: (text: string, done: boolean) => void;
}

/** Nothing at all for a week with no priorities, so the list keeps the full width. */
export function PrioritiesColumn({ week, now, onToggle }: PrioritiesColumnProps) {
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
                {priority.details.map((detail) => (
                  <div key={detail} className="break-words text-xs text-muted-foreground">
                    {detail}
                  </div>
                ))}
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
 * The page's layout around the list. On a wide page the priorities sit in a
 * column to the right, kept in view while the list scrolls; on a narrow one
 * they sit above the list, full width.
 */
export function WithPriorities({ priorities, children }: { priorities: React.ReactNode; children: React.ReactNode }) {
  if (priorities === null) return <>{children}</>;
  return (
    <div className="@container">
      <div className="flex flex-col @4xl:flex-row-reverse @4xl:items-start">
        <aside className="border-b border-border px-4 pb-3 pt-3 md:px-5 md:pt-4 @4xl:sticky @4xl:top-0 @4xl:w-64 @4xl:shrink-0 @4xl:border-b-0 @4xl:border-l @4xl:px-4 @4xl:pb-4">
          {priorities}
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

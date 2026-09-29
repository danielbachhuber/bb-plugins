// The Now section's runs, one square per row, above its rows. Pressing a run
// shows only its rows; pressing it again shows them all.
import { cn } from "@/lib/utils";

import { NOW_GROUPS, nowGroupOf, type NowGroupId } from "./sections.js";
import type { Item } from "./types.js";

// Blue, red, and yellow pass a colorblind-separation check in each mode. The
// grays are quiet on purpose: read mail and later tasks are not asking for you.
const COLORS: Record<NowGroupId, string> = {
  decide: "bg-[#2a78d6] dark:bg-[#3987e5]",
  overdue: "bg-[#d03b3b] dark:bg-[#d03b3b]",
  today: "bg-[#eda100] dark:bg-[#c98500]",
  read: "bg-[#b5b3ab] dark:bg-[#6b6a65]",
  later: "bg-[#dcdad3] dark:bg-[#3f3e3b]",
};

export interface NowSummaryProps {
  /** The Now section's rows, in its order. */
  items: readonly Item[];
  now: Date;
  /** The run the list is narrowed to, or null for all of them. */
  value: NowGroupId | null;
  onChange: (value: NowGroupId | null) => void;
}

export function NowSummary({ items, now, value, onChange }: NowSummaryProps) {
  const runs = NOW_GROUPS.map((group) => ({ ...group, items: items.filter((item) => nowGroupOf(item, now) === group.id) }))
    .filter((run) => run.items.length > 0);
  if (runs.length === 0) return null;
  return (
    <div role="group" aria-label="Now, by run" className="flex flex-wrap items-start gap-1">
      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          aria-pressed={run.id === value}
          onClick={() => onChange(run.id === value ? null : run.id)}
          className={cn(
            "group space-y-1 rounded-md px-1.5 py-1 text-left hover:bg-muted/60",
            run.id === value && "bg-muted",
          )}
        >
          {/* A run not chosen fades while another one is. */}
          <span className={cn("flex flex-wrap gap-[2px] transition-opacity", value !== null && run.id !== value && "opacity-30")}>
            {run.items.map((item) => (
              <span key={item.id} title={item.title} className={cn("size-3 rounded-[3px]", COLORS[run.id])} />
            ))}
          </span>
          <span
            className={cn(
              "block text-xs text-muted-foreground group-hover:text-foreground",
              run.id === value && "text-foreground",
            )}
          >
            <span className="font-medium tabular-nums text-foreground">{run.items.length}</span> {run.label.toLowerCase()}
          </span>
        </button>
      ))}
    </div>
  );
}

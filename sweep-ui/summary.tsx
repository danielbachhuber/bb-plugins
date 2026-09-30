// One square per row, grouped into runs, as the Now page draws above its Now
// section. Pressing a run shows only its rows; pressing it again shows them all.
import { cn } from "./lib/cn";
import type { Run, RunTone, SweepItem } from "./types";

// Colors keyed by what they mean in every sweep: blue for new, red for late,
// green for work already under way. The grays are quiet on purpose, because
// Next and Later rows are not asking for you yet.
const COLORS: Record<RunTone, string> = {
  new: "bg-[#2a78d6] dark:bg-[#3987e5]",
  late: "bg-[#d03b3b]",
  underway: "bg-[#2da44e] dark:bg-[#3fb950]",
  next: "bg-[#b5b3ab] dark:bg-[#6b6a65]",
  later: "bg-[#dcdad3] dark:bg-[#3f3e3b]",
};

export interface SummarySquaresProps {
  /** Every run, in list order. Runs with no rows are left out. */
  runs: readonly Run[];
  items: readonly SweepItem[];
  /** The run the list is narrowed to, or null for all of them. */
  value: string | null;
  onChange: (value: string | null) => void;
}

export function SummarySquares({ runs, items, value, onChange }: SummarySquaresProps) {
  const shown = runs
    .map((run) => ({ run, items: items.filter((item) => item.runId === run.id) }))
    .filter((entry) => entry.items.length > 0);
  if (shown.length === 0) return null;
  return (
    <div role="group" aria-label="Rows by run" className="flex flex-wrap items-start gap-1">
      {shown.map(({ run, items: runItems }) => (
        <button
          key={run.id}
          type="button"
          aria-pressed={run.id === value}
          onClick={() => onChange(run.id === value ? null : run.id)}
          className={cn("group space-y-1 rounded-md px-1.5 py-1 text-left hover:bg-muted/60", run.id === value && "bg-muted")}
        >
          {/* A run not chosen fades while another one is. */}
          <span className={cn("flex flex-wrap gap-[2px] transition-opacity", value !== null && run.id !== value && "opacity-30")}>
            {runItems.map((item) => (
              <span key={item.key} title={item.title} className={cn("size-3 rounded-[3px]", COLORS[run.tone])} />
            ))}
          </span>
          <span className={cn("block text-xs text-muted-foreground group-hover:text-foreground", run.id === value && "text-foreground")}>
            <span className="font-medium tabular-nums text-foreground">{runItems.length}</span>{" "}
            {runItems.length === 1 ? run.labelOne : run.label}
          </span>
        </button>
      ))}
    </div>
  );
}

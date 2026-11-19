// The goal at the top of the Tokenomics popover, and the donut on its header
// button and beside each sidebar row. Resting on the sidebar donut opens a
// card with the "Done is" list, the estimate, and what the goal has used.
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import Edit02Icon from "@hugeicons/core-free-icons/Edit02Icon";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { GoalViewData } from "@/usage/contract";
import { progressOf } from "@/usage/goals";
import { formatTokens } from "@/usage/series";

import { useHoverOpen } from "./hover-open";
import { ROW_STATES, type BbRowState } from "./row-activity";

type Range = { low: number; high: number } | null;

function rangeText(range: Range, unit: "turns" | "tokens" | "min"): string | null {
  if (range === null) return null;
  const show = (value: number) => (unit === "tokens" ? formatTokens(value) : String(Math.round(value)));
  const text = range.low === range.high ? show(range.low) : `${show(range.low)}–${show(range.high)}`;
  return unit === "tokens" ? text : `${text} ${unit}`;
}

function SpentRow({ label, spent, estimate }: { label: string; spent: string; estimate: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {spent}
        {estimate === null ? null : <span className="text-muted-foreground"> of {estimate}</span>}
      </span>
    </div>
  );
}

const SHAPE_LABEL = { task: "Goal", exploration: "Question", project: "Purpose", none: "Goal" } as const;
const OUTCOME_LABEL = { met: "Met", partly: "Partly met", not: "Not met" } as const;

const ACTIVITY_NOTE: Partial<Record<NonNullable<DonutActivity>, string>> = {
  working: "In progress",
  waiting: "Waiting on you",
  queued: "Message queued",
  error: "Failed",
};

/** The circle before a stage in the card: done, the one being worked on, or not yet. */
function StageCircle({ done, current, activity }: { done: boolean; current: boolean; activity: DonutActivity }) {
  if (done) {
    return (
      <span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-foreground bg-foreground text-background">
        <HugeiconsIcon icon={Tick02Icon} size={10} strokeWidth={2.6} />
      </span>
    );
  }
  if (current && activity === "working") {
    // Dashed, as the donut's segment for the stage being worked on is.
    return <span aria-hidden className="size-3.5 shrink-0 rounded-full border-2 border-dashed border-foreground/60" />;
  }
  if (current && activity === "waiting") {
    return (
      <span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-blue-500">
        <span className="size-1.5 rounded-full bg-blue-500" />
      </span>
    );
  }
  if (current && activity === "error") {
    return <span aria-hidden className="size-3.5 shrink-0 rounded-full border-2 border-destructive" />;
  }
  if (current && activity === "queued") {
    return (
      <span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/70">
        <span className="size-1.5 rounded-full border border-muted-foreground/70" />
      </span>
    );
  }
  return <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-muted-foreground/50" />;
}

/**
 * The card's body, apart from the trigger, so a story can show it open.
 * `activity` is what the thread is doing now; the stage being worked on
 * shows it, as the donut does.
 */
export function GoalCard({ goal, activity = null }: { goal: GoalViewData; activity?: DonutActivity }) {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">{SHAPE_LABEL[goal.shape]}</span>
        <span className="text-sm text-foreground">{goal.text}</span>
      </div>
      {goal.entries.length === 0 ? null : (
        <ol className="flex max-h-60 flex-col gap-1 overflow-y-auto">
          {shownEntries(goal).map((entry, index) => {
            const done = entry.state === "done";
            const current = entry.state === "current";
            const note = current && activity !== null ? ACTIVITY_NOTE[activity] : undefined;
            return (
              <li
                key={`${index}-${entry.label}`}
                className={cn(
                  "flex items-center gap-1.5",
                  done || note ? "text-foreground" : "text-muted-foreground",
                  entry.state === "dropped" && "line-through opacity-70",
                )}
              >
                <StageCircle done={done} current={current} activity={activity} />
                <span className="min-w-0 truncate">{entry.label}</span>
                {note ? (
                  <span className={cn("ml-auto shrink-0 pl-2", activity === "error" ? "text-destructive" : activity === "waiting" ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")}>
                    {note}
                  </span>
                ) : entry.count ? (
                  <span className="ml-auto shrink-0 pl-2 tabular-nums text-muted-foreground">
                    {entry.count.done} of {entry.count.total}
                  </span>
                ) : null}
                <span className="sr-only">({note ?? ENTRY_STATE_TEXT[entry.state]})</span>
              </li>
            );
          })}
        </ol>
      )}
      {goal.shape === "exploration" && activity !== null && ACTIVITY_NOTE[activity] ? (
        <span className="text-muted-foreground">{ACTIVITY_NOTE[activity]}</span>
      ) : null}
      {goal.outcome === null ? null : (
        <div>
          <span className="font-medium">{OUTCOME_LABEL[goal.outcome]}</span>
          {goal.outcomeNote ? <span className="text-muted-foreground"> · {goal.outcomeNote}</span> : null}
        </div>
      )}
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <SpentRow label="Turns" spent={String(goal.spent.turns)} estimate={rangeText(goal.estimate.turns, "turns")} />
        <SpentRow label="Tokens" spent={formatTokens(goal.spent.tokens)} estimate={rangeText(goal.estimate.tokens, "tokens")} />
        <SpentRow label="Time" spent={`${Math.round(goal.spent.ms / 60_000)} min`} estimate={rangeText(goal.estimate.minutes, "min")} />
        {goal.left === null ? null : <span className="text-muted-foreground">{goal.left === "past estimate" ? "Past the estimate" : goal.left}</span>}
      </div>
      <div className="text-muted-foreground">
        {goal.revisions > 0 ? `Revised ${goal.revisions === 1 ? "once" : `${goal.revisions} times`}. ` : ""}
        Run /tokenomics-update-goal to change it.
      </div>
    </div>
  );
}

type Entry = GoalViewData["entries"][number];
type BandEntry = Pick<Entry, "label" | "state" | "count">;

/**
 * The entries as they show: each in its own state, and, while the goal is
 * open and none is marked in progress, the first unfinished one shown as in
 * progress, as an ordered list of end states is worked through.
 */
export function shownEntries(goal: Pick<GoalViewData, "entries" | "outcome">): BandEntry[] {
  if (goal.outcome !== null || goal.entries.some((entry) => entry.state === "current")) return goal.entries;
  const next = goal.entries.findIndex((entry) => entry.state === "todo");
  return goal.entries.map((entry, index) => (index === next ? { ...entry, state: "current" } : entry));
}

/** A small square per entry: filled when done, light while in progress, outlined before, grey when dropped. */
function EntrySquare({ state }: { state: BandEntry["state"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-[3px]",
        state === "done" && "bg-foreground/65",
        state === "current" && "bg-foreground/30",
        state === "todo" && "border border-muted-foreground/35",
        state === "dropped" && "border border-muted-foreground/50 bg-muted",
      )}
    />
  );
}

const ENTRY_STATE_TEXT = { done: "done", current: "in progress", todo: "not yet", dropped: "dropped" } as const;

/** What the goal has used against its estimate, on one line: "4 of 3–8 turns · 9.1M of 5M–20M tokens · 26 of 20–60 min". */
function usedLine(goal: GoalViewData): string {
  const part = (spent: string, range: Range, unit: "turns" | "tokens" | "min") => {
    const estimate = rangeText(range, unit);
    return estimate === null ? null : `${spent} of ${estimate}`;
  };
  return [
    part(String(goal.spent.turns), goal.estimate.turns, "turns") ?? `${goal.spent.turns} turns`,
    part(formatTokens(goal.spent.tokens), goal.estimate.tokens, "tokens") ?? `${formatTokens(goal.spent.tokens)} tokens`,
    part(String(Math.round(goal.spent.ms / 60_000)), goal.estimate.minutes, "min") ?? `${Math.round(goal.spent.ms / 60_000)} min`,
  ].join(" · ");
}

/**
 * The goal at the top of the Tokenomics popover: the goal, its "Done is"
 * list (the segments of the button's donut), and what it has used against
 * its estimate.
 */
export function CompactGoal({
  goal,
  activity = null,
  heading = true,
  usage = true,
}: {
  goal: GoalViewData;
  activity?: DonutActivity;
  /** The "Goal · 2 of 4" line, left out where a label already says it. */
  heading?: boolean;
  /** The line of what the goal used, left out where meters show it. */
  usage?: boolean;
}) {
  if (goal.label === null) return null;
  const progress =
    goal.outcome !== null
      ? OUTCOME_LABEL[goal.outcome]
      : goal.entries.length > 0
        ? (({ done, total }) => `${done} of ${total} done`)(progressOf(goal.entries))
        : goal.label;
  const note = activity !== null && goal.outcome === null ? ACTIVITY_NOTE[activity] : undefined;
  return (
    <div data-tokenomics-goal="" className="flex flex-col gap-2 text-xs">
      <span className={cn("flex items-baseline justify-between gap-3 text-muted-foreground", !heading && !note && "hidden")}>
        <span>{heading ? `${SHAPE_LABEL[goal.shape]} · ${progress}` : null}</span>
        {note ? (
          <span className={cn(activity === "error" ? "text-destructive" : activity === "waiting" ? "text-blue-600 dark:text-blue-400" : undefined)}>{note}</span>
        ) : null}
      </span>
      <span className="text-sm text-foreground">{goal.text}</span>
      {goal.entries.length === 0 ? null : (
        <>
          <span className="text-muted-foreground">Done is</span>
          <EntryGrid entries={shownEntries(goal)} />
        </>
      )}
      <span className={cn("text-muted-foreground", !usage && "hidden")}>
        {usedLine(goal)}
        {goal.left === null ? null : (
          <span className={cn(goal.left === "past estimate" && "text-amber-600 dark:text-amber-400")}> · {goal.left}</span>
        )}
      </span>
      {goal.outcome !== null && goal.outcomeNote ? <span className="text-muted-foreground">{goal.outcomeNote}</span> : null}
    </div>
  );
}

/** Lists this long or shorter show one entry per line, wrapping, rather than two truncated columns. */
const WRAP_UP_TO = 10;

/**
 * Entries with a square and name each: one per line, the names wrapping, for
 * ten or fewer; past that, two columns of truncated names, or one column when
 * an entry has a count to show at the right.
 */
function EntryGrid({ entries }: { entries: BandEntry[] }) {
  if (entries.length === 0) return null;
  const wrap = entries.length <= WRAP_UP_TO;
  const oneColumn = wrap || entries.some((entry) => entry.count !== undefined);
  return (
    <ol className={cn("max-h-48 gap-x-3 gap-y-1 overflow-y-auto", oneColumn ? "flex flex-col" : "grid grid-cols-2")}>
      {entries.map((entry, index) => (
        <li key={`${index}-${entry.label}`} title={wrap ? undefined : entry.label} className={cn("flex min-w-0 gap-1.5", wrap ? "items-start" : "items-center")}>
          {/* Level with the first line of a wrapped name. */}
          <span className={cn("flex shrink-0", wrap && "h-4 items-center")}>
            <EntrySquare state={entry.state} />
          </span>
          <span
            className={cn(
              wrap ? "min-w-0" : "truncate",
              entry.state === "current" ? "text-foreground" : "text-muted-foreground",
              entry.state === "dropped" && "line-through opacity-70",
            )}
          >
            {entry.label}
          </span>
          {entry.count ? (
            <span className="ml-auto shrink-0 pl-2 tabular-nums text-muted-foreground">
              {entry.count.done} of {entry.count.total}
            </span>
          ) : null}
          <span className="sr-only">({ENTRY_STATE_TEXT[entry.state]})</span>
        </li>
      ))}
    </ol>
  );
}

export interface SidebarMark {
  label: string;
  stages: number;
  reached: number;
  /** Each entry's state, in order, so each segment shows its own; without it, the first `reached` are done. */
  states?: Entry["state"][];
  /** Each entry's count, in order, null for an entry without one. */
  counts?: (Entry["count"] | null)[];
  outcome: "met" | "partly" | "not" | null;
  left: string | null;
  /** An Impromptu UI card above the thread's composer still has an open item. */
  openCard?: boolean;
  /** The thread's last turn failed, as on a provider error. */
  failed?: boolean;
}

/**
 * The segmented donut before a sidebar row's title, where bb's hover actions
 * don't cover it. Resting on it opens the
 * goal's card, read by `loadGoal` when it first opens; a click opens the
 * thread, as the rest of the row does.
 */
export function SidebarGoalMark({
  mark,
  state = "none",
  loadGoal,
  onOpenThread,
  defaultOpen = false,
}: {
  mark: SidebarMark;
  /** bb's state for the row, which the donut shows in place of bb's icon. */
  state?: BbRowState;
  loadGoal?: () => Promise<GoalViewData | null>;
  onOpenThread?: () => void;
  defaultOpen?: boolean;
}) {
  const [goal, setGoal] = useState<GoalViewData | null>(null);
  const { open, onOpenChange, hover } = useHoverOpen({
    defaultOpen,
    onOpen: () => {
      loadGoal?.().then(setGoal, () => undefined);
    },
  });
  const archived = state === "archived";
  const activity = ROW_STATES[state].activity;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span
          {...hover}
          role="img"
          aria-label={`Goal: ${mark.label}${mark.left ? ` · ${mark.left}` : ""}${state === "none" ? "" : ` · ${ROW_STATES[state].label}`}`}
          className="pointer-events-auto relative z-[31] mr-1.5 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenThread?.();
          }}
        >
          {activity === "draft" && !archived ? (
            // bb's own draft icon, as bb draws it in this slot.
            <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
          ) : (
            <GoalDonut
              stages={mark.stages}
              reached={mark.reached}
              states={mark.states}
              counts={mark.counts}
              outcome={mark.outcome}
              tone={mark.left === "past estimate" ? "over" : "default"}
              activity={archived ? null : activity}
            />
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        className="w-[320px] p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        {...hover}
      >
        {goal === null ? <span className="text-xs text-muted-foreground">{mark.label}</span> : <GoalCard goal={goal} activity={activity} />}
      </PopoverContent>
    </Popover>
  );
}

/** What bb's row icon says about the thread, as the donut and the card show it. */
export type DonutActivity = "working" | "error" | "waiting" | "queued" | "unread" | "draft" | null;

/** A dropped entry's segment: finished, but lighter than done. */
const DROPPED_ARC = "stroke-muted-foreground/45";

/** The done arc's colour for a bb state; states not listed keep the usual colour. */
const DONE_ARC: Partial<Record<NonNullable<DonutActivity>, string>> = {
  waiting: "stroke-blue-500",
  error: "stroke-destructive",
  unread: "stroke-foreground",
};

/** One turn of the donut while the thread works. */
const SPIN_SECONDS = 2.4;

/** A dash pattern that fills one segment of `length` with short dashes, then skips the rest of the ring. */
export function dashedSegment(length: number, circumference: number, dash = 1.6, space = 1.3): string {
  const count = Math.max(1, Math.round((length + space) / (dash + space)));
  // Stretch the dashes so the first and last meet the segment's ends.
  const fitted = count === 1 ? length : (length - space * (count - 1)) / count;
  const parts: number[] = [];
  for (let index = 0; index < count; index += 1) parts.push(fitted, index === count - 1 ? circumference - length : space);
  return parts.map((part) => part.toFixed(2)).join(" ");
}

/** An entry's arc on the donut: where it starts, how long it is, and how much of it is filled. */
export interface DonutArc {
  start: number;
  length: number;
  /** 0 to 1: a done or dropped entry is whole, a grouped one fills by its count. */
  filled: number;
  state: Entry["state"];
}

/**
 * Splits the ring among the entries by how many items each holds: a grouped
 * entry such as "Serious issues addressed · 3 of 14" takes 14 parts and fills
 * 3 of them, and an entry without a count takes one. A small gap separates
 * the entries.
 */
export function donutArcs(
  states: readonly Entry["state"][],
  counts: readonly (Entry["count"] | null | undefined)[],
  circumference: number,
  stroke: number,
): DonutArc[] {
  const stages = states.length;
  if (stages === 0) return [];
  const weights = states.map((_, index) => Math.max(1, counts[index]?.total ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const gap = stages > 1 ? Math.min(circumference / stages / 3, stroke * 0.9) : 0;
  const available = circumference - gap * stages;
  let start = gap / 2;
  return states.map((state, index) => {
    const length = (available * weights[index]!) / total;
    const count = counts[index];
    const filled = state === "done" || state === "dropped" ? 1 : count ? Math.min(1, count.done / Math.max(1, count.total)) : 0;
    const arc = { start, length, filled, state };
    start += length + gap;
    return arc;
  });
}

/**
 * A ring split into one segment per stage, the done ones filled, each as
 * long as the items it holds (see donutArcs). bb's state
 * colours the done arc: blue when the thread needs you, red when it failed,
 * darker when it finished and you haven't looked. While the thread works the
 * stage it is on is dashed and the whole ring turns. A met goal is a
 * filled disc with a check, one not met a grey ring with a cross. Queued and idle look alike; a draft shows bb's own
 * icon instead, in SidebarGoalMark.
 */
export function GoalDonut({
  stages,
  reached,
  states,
  counts = [],
  outcome = null,
  size = 16,
  stroke = 2.2,
  tone = "default",
  activity = null,
  spinDelay,
}: {
  stages: number;
  reached: number;
  /** Each entry's state, in order; without it, the first `reached` segments are done. */
  states?: readonly Entry["state"][];
  /** Each entry's count, in order, for grouped entries; their arcs grow and fill by it. */
  counts?: readonly (Entry["count"] | null | undefined)[];
  outcome?: "met" | "partly" | "not" | null;
  size?: number;
  stroke?: number;
  tone?: "default" | "over";
  activity?: DonutActivity;
  /** A negative delay, so a story can show the spin at a given point. */
  spinDelay?: string;
}) {
  const radius = (size - stroke) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = tone === "over" ? "stroke-amber-500" : "stroke-foreground/75";
  const empty = "stroke-muted-foreground/25";
  if (outcome === "met") {
    // Done reads as a filled disc with a check, not an outline.
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
        <circle cx="7" cy="7" r="6.5" className="fill-foreground/75" />
        <path d="M4.2 7.2 6.1 9 9.8 5.1" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-background" />
      </svg>
    );
  }
  if (outcome === "not") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
        <circle cx="7" cy="7" r="5.8" fill="none" strokeWidth="1.6" className="stroke-muted-foreground/50" />
        <path d="M5 5l4 4M9 5l-4 4" strokeWidth="1.4" strokeLinecap="round" className="stroke-muted-foreground/70" />
      </svg>
    );
  }
  const working = activity === "working";
  const doneClass = (activity !== null && DONE_ARC[activity]) || filled;
  const svgProps = {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    "aria-hidden": true,
    className: cn("shrink-0", working ? "motion-safe:animate-spin" : "-rotate-90"),
    style: working ? { animationDuration: `${SPIN_SECONDS}s`, animationDelay: spinDelay } : undefined,
  } as const;
  if (stages === 0) {
    // A goal recorded before explorations had stages.
    return (
      <svg {...svgProps}>
        <circle cx={centre} cy={centre} r={radius} fill="none" strokeWidth={stroke} className={empty}
          strokeDasharray={`${circumference / 12} ${circumference / 12}`} />
      </svg>
    );
  }
  // Each segment's state: from `states` when given, else the first `reached` done.
  const segment = (index: number): Entry["state"] => (states ? (states[index] ?? "todo") : index < reached ? "done" : "todo");
  const arcs = donutArcs(Array.from({ length: stages }, (_, index) => segment(index)), counts, circumference, stroke);
  // While working, the entry in progress is drawn dashed: the one marked so,
  // or else the first not yet started.
  const explicit = arcs.findIndex((arc) => arc.state === "current");
  const firstTodo = arcs.findIndex((arc) => arc.state === "todo");
  const active = working ? (explicit >= 0 ? explicit : firstTodo) : -1;
  const ring = (start: number, length: number, className: string, key: string, dashed = false) => (
    <circle
      key={key}
      cx={centre}
      cy={centre}
      r={radius}
      fill="none"
      strokeWidth={stroke}
      strokeDasharray={dashed ? dashedSegment(length, circumference) : `${length} ${circumference - length}`}
      strokeDashoffset={-start}
      className={className}
    />
  );
  return (
    <svg {...svgProps}>
      {arcs.flatMap((arc, index) => {
        const doneLength = arc.length * arc.filled;
        const rest = arc.length - doneLength;
        const fill = arc.state === "dropped" ? DROPPED_ARC : doneClass;
        return [
          doneLength > 0 ? ring(arc.start, doneLength, fill, `${index}-done`) : null,
          // The entry being worked on shows its unfinished part dashed, so the
          // turning ring has something to show even when every segment would
          // look the same, as with a single stage or none done yet.
          rest > 0 ? ring(arc.start + doneLength, rest, index === active ? doneClass : empty, `${index}-rest`, index === active) : null,
        ];
      })}
    </svg>
  );
}

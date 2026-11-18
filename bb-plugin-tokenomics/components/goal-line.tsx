// The goal at the top of the Tokenomics popover, and the donut on its header
// button and beside each sidebar row. Resting on the sidebar donut opens a
// card with the stages, any items, the estimate, and what the goal has used.
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import Edit02Icon from "@hugeicons/core-free-icons/Edit02Icon";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { GoalViewData } from "@/usage/contract";
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
      {goal.stages.length === 0 ? null : (
        <ol className="flex flex-col gap-1">
          {goal.stages.map((stage, index) => {
            const done = index < goal.reached;
            const current = !done && index === goal.reached && goal.outcome === null;
            const note = current && activity !== null ? ACTIVITY_NOTE[activity] : undefined;
            return (
              <li key={stage} className={cn("flex items-center gap-1.5", done || note ? "text-foreground" : "text-muted-foreground")}>
                <StageCircle done={done} current={current} activity={activity} />
                <span>{stage}</span>
                {note ? (
                  <span className={cn("ml-auto shrink-0 pl-2", activity === "error" ? "text-destructive" : activity === "waiting" ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")}>
                    {note}
                  </span>
                ) : null}
                <span className="sr-only">{done ? "(done)" : note ? `(${note})` : "(not yet)"}</span>
              </li>
            );
          })}
        </ol>
      )}
      {goal.items.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Items · {itemsProgress(goal.items)}</span>
          <ol className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {goal.items.map((item, index) => (
              <li
                key={`${index}-${item.label}`}
                className={cn(
                  "flex items-center gap-1.5",
                  item.state === "current" ? "text-foreground" : "text-muted-foreground",
                  item.state === "dropped" && "line-through opacity-70",
                )}
              >
                <EntrySquare state={item.state} />
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="sr-only">({ENTRY_STATE_TEXT[item.state]})</span>
              </li>
            ))}
          </ol>
        </div>
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

type BandEntry = { label: string; state: GoalViewData["items"][number]["state"] };

/** The goal's stages as band entries: done up to `reached`, the next one in progress while the goal is open. */
function stageEntries(goal: GoalViewData): BandEntry[] {
  return goal.stages.map((label, index) => ({
    label,
    state: index < goal.reached ? "done" : index === goal.reached && goal.outcome === null ? "current" : "todo",
  }));
}

/** A small square per stage or item: filled when done, light while in progress, outlined before, grey when dropped. */
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
 * The goal at the top of the Tokenomics popover: the goal, a square and name
 * for each stage (the segments of the button's donut), then each item when
 * the goal has a list, and what it has used against its estimate.
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
  // With items, each list carries its own count, so the heading doesn't
  // float a stage count above two lists; without, the heading counts stages.
  const listed = goal.items.length > 0 && goal.stages.length > 0;
  const progress =
    goal.outcome !== null
      ? OUTCOME_LABEL[goal.outcome]
      : listed
        ? null
        : goal.stages.length > 0
          ? `${Math.min(goal.reached, goal.stages.length)} of ${goal.stages.length}`
          : goal.label;
  const note = activity !== null && goal.outcome === null ? ACTIVITY_NOTE[activity] : undefined;
  return (
    <div data-tokenomics-goal="" className="flex flex-col gap-2 text-xs">
      <span className={cn("flex items-baseline justify-between gap-3 text-muted-foreground", !heading && !note && "hidden")}>
        <span>{heading ? (progress === null ? SHAPE_LABEL[goal.shape] : `${SHAPE_LABEL[goal.shape]} · ${progress}`) : null}</span>
        {note ? (
          <span className={cn(activity === "error" ? "text-destructive" : activity === "waiting" ? "text-blue-600 dark:text-blue-400" : undefined)}>{note}</span>
        ) : null}
      </span>
      <span className="text-sm text-foreground">{goal.text}</span>
      {listed ? (
        <span className="text-muted-foreground">Stages · {Math.min(goal.reached, goal.stages.length)} of {goal.stages.length}</span>
      ) : null}
      <EntryGrid entries={stageEntries(goal)} />
      {goal.items.length === 0 ? null : (
        <>
          <span className="text-muted-foreground">Items · {itemsProgress(goal.items)}</span>
          <EntryGrid entries={goal.items} />
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

/** Stages or items as a two-column grid of squares and names. */
function EntryGrid({ entries }: { entries: BandEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ol className="grid max-h-40 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto">
      {entries.map((entry, index) => (
        <li key={`${index}-${entry.label}`} title={entry.label} className="flex min-w-0 items-center gap-1.5">
          <EntrySquare state={entry.state} />
          <span
            className={cn(
              "truncate",
              entry.state === "current" ? "text-foreground" : "text-muted-foreground",
              entry.state === "dropped" && "line-through opacity-70",
            )}
          >
            {entry.label}
          </span>
          <span className="sr-only">({ENTRY_STATE_TEXT[entry.state]})</span>
        </li>
      ))}
    </ol>
  );
}

function itemsProgress(items: GoalViewData["items"]): string {
  const finished = items.filter((item) => item.state === "done" || item.state === "dropped").length;
  return `${finished} of ${items.length}`;
}

export interface SidebarMark {
  label: string;
  stages: number;
  reached: number;
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

/**
 * A ring split into one segment per stage, the done ones filled. bb's state
 * colours the done arc: blue when the thread needs you, red when it failed,
 * darker when it finished and you haven't looked. While the thread works the
 * stage it is on is dashed and the whole ring turns. A met goal is a
 * filled disc with a check, one not met a grey ring with a cross. Queued and idle look alike; a draft shows bb's own
 * icon instead, in SidebarGoalMark.
 */
export function GoalDonut({
  stages,
  reached,
  outcome = null,
  size = 16,
  stroke = 2.2,
  tone = "default",
  activity = null,
  spinDelay,
}: {
  stages: number;
  reached: number;
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
  // A small gap between segments, so each reads as its own stage.
  const gap = stages > 1 ? Math.min(circumference / stages / 3, stroke * 0.9) : 0;
  const length = circumference / stages - gap;
  const inProgress = working && reached < stages;
  return (
    <svg {...svgProps}>
      {Array.from({ length: stages }, (_, index) => (
        <circle
          key={index}
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${length} ${circumference - length}`}
          strokeDashoffset={-index * (length + gap) - gap / 2}
          className={index < reached ? doneClass : empty}
          // The stage being worked on is drawn dashed instead, below.
          visibility={inProgress && index === reached ? "hidden" : undefined}
        />
      ))}
      {inProgress && (
        // The stage being worked on is drawn dashed, so the turning ring has
        // something to show even when every segment would look the same,
        // as with a single stage or none done yet.
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={dashedSegment(length, circumference)}
          strokeDashoffset={-reached * (length + gap) - gap / 2}
          className={doneClass}
        />
      )}
    </svg>
  );
}

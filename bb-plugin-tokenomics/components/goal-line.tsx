// The goal band above a thread's conversation and the donut beside its
// sidebar row. Resting on either opens a card with the stages, the estimate, and what the
// goal has used so far.
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Target02Icon from "@hugeicons/core-free-icons/Target02Icon";
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
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
    // Half filled and pulsing, as the donut's next segment does.
    return (
      <span aria-hidden className="relative flex size-3.5 shrink-0 items-center justify-center rounded-full border border-foreground/60 motion-safe:animate-pulse">
        <span className="absolute inset-[2px] rounded-full bg-[conic-gradient(currentColor_0_50%,transparent_50%_100%)] text-foreground/60" />
      </span>
    );
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
        Run /tokenomics-set-goal to change it.
      </div>
    </div>
  );
}

/** A segment per stage, filled for each one done. */
function StageSegments({ stages, reached }: { stages: number; reached: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: stages }, (_, index) => (
        <span key={index} className={cn("h-1.5 w-3 rounded-full", index < reached ? "bg-foreground/70" : "bg-muted-foreground/25")} />
      ))}
    </span>
  );
}

/**
 * The band between the thread header and the conversation. The conversation
 * scrolls under it, so the goal stays in view.
 */
export function GoalBand({
  goal,
  defaultOpen = false,
  readActivity,
}: {
  goal: GoalViewData;
  defaultOpen?: boolean;
  /** What the thread is doing, read when the card opens. */
  readActivity?: () => DonutActivity;
}) {
  if (goal.label === null) return null;
  return (
    <div data-tokenomics-goal-band="" className="border-b border-border-seam-vertical/60 bg-background px-4 py-1.5 md:px-5">
      <GoalLine goal={goal} defaultOpen={defaultOpen} band readActivity={readActivity} />
    </div>
  );
}

export function GoalLine({
  goal,
  defaultOpen = false,
  band = false,
  readActivity,
}: {
  goal: GoalViewData;
  defaultOpen?: boolean;
  band?: boolean;
  readActivity?: () => DonutActivity;
}) {
  const [activity, setActivity] = useState<DonutActivity>(null);
  const { open, onOpenChange, hover } = useHoverOpen({ defaultOpen, onOpen: () => setActivity(readActivity?.() ?? null) });
  if (goal.label === null) return null;
  const closed = goal.outcome !== null;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          {...hover}
          type="button"
          data-tokenomics-goal-line=""
          className={cn(
            "flex w-full min-w-0 items-center overflow-hidden whitespace-nowrap text-left text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground",
            band ? "gap-1.5 text-xs leading-5" : "gap-1 text-[11px] leading-4",
          )}
        >
          <HugeiconsIcon
            icon={closed && goal.outcome === "met" ? CheckmarkCircle02Icon : Target02Icon}
            size={12}
            strokeWidth={1.8}
            className="shrink-0"
          />
          {/* In a narrow pane the turns left go first, then the goal, and the stage last. */}
          <span className={cn("min-w-[2.5rem] truncate", band && "text-foreground")} style={{ flexShrink: 10 }}>
            {goal.text}
          </span>
          <span aria-hidden className="shrink-0">·</span>
          {band && goal.stages.length > 0 && goal.outcome === null ? <StageSegments stages={goal.stages.length} reached={goal.reached} /> : null}
          <span className="min-w-0 truncate" style={{ flexShrink: 1 }}>
            {goal.label}
          </span>
          {goal.left === null ? null : (
            <span
              className={cn("min-w-0 truncate", goal.left === "past estimate" && "text-amber-600 dark:text-amber-400")}
              style={{ flexShrink: 100 }}
            >
              · {goal.left}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-3"
        // Opened by hover, it leaves focus where it was, such as in the composer.
        onOpenAutoFocus={(event) => event.preventDefault()}
        {...hover}
      >
        <GoalCard goal={goal} activity={activity} />
      </PopoverContent>
    </Popover>
  );
}

export interface SidebarMark {
  label: string;
  stages: number;
  reached: number;
  outcome: "met" | "partly" | "not" | null;
  left: string | null;
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

/**
 * A ring split into one segment per stage, the done ones filled. bb's state
 * colours the done arc: blue when the thread needs you, red when it failed,
 * darker when it finished and you haven't looked. While the thread works the
 * whole ring turns. A met goal is a filled disc with a check, one not met a
 * grey ring with a cross. Queued and idle look alike; a draft shows bb's own
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
        />
      ))}
    </svg>
  );
}

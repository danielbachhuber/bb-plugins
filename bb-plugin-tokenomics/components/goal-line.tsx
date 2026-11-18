// The goal band above a thread's conversation and the donut beside its
// sidebar row. Resting on either opens a card with the stages, the estimate, and what the
// goal has used so far.
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Target02Icon from "@hugeicons/core-free-icons/Target02Icon";
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { GoalViewData } from "@/usage/contract";
import { formatTokens } from "@/usage/series";

import { useHoverOpen } from "./hover-open";

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

/** The card's body, apart from the trigger, so a story can show it open. */
export function GoalCard({ goal }: { goal: GoalViewData }) {
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
            return (
              <li key={stage} className={cn("flex items-center gap-1.5", done ? "text-foreground" : "text-muted-foreground")}>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                    done ? "border-foreground bg-foreground text-background" : "border-muted-foreground/50",
                  )}
                >
                  {done ? <HugeiconsIcon icon={Tick02Icon} size={10} strokeWidth={2.6} /> : null}
                </span>
                <span>{stage}</span>
                <span className="sr-only">{done ? "(done)" : "(not yet)"}</span>
              </li>
            );
          })}
        </ol>
      )}
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
export function GoalBand({ goal, defaultOpen = false }: { goal: GoalViewData; defaultOpen?: boolean }) {
  if (goal.label === null) return null;
  return (
    <div data-tokenomics-goal-band="" className="border-b border-border-seam-vertical/60 bg-background px-4 py-1.5 md:px-5">
      <GoalLine goal={goal} defaultOpen={defaultOpen} band />
    </div>
  );
}

export function GoalLine({ goal, defaultOpen = false, band = false }: { goal: GoalViewData; defaultOpen?: boolean; band?: boolean }) {
  const { open, onOpenChange, hover } = useHoverOpen({ defaultOpen });
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
        <GoalCard goal={goal} />
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
  loadGoal,
  onOpenThread,
  defaultOpen = false,
}: {
  mark: SidebarMark;
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
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span
          {...hover}
          role="img"
          aria-label={`Goal: ${mark.label}${mark.left ? ` · ${mark.left}` : ""}`}
          className="pointer-events-auto relative z-[31] mr-1.5 inline-flex shrink-0 cursor-pointer items-center"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenThread?.();
          }}
        >
          <GoalDonut
            stages={mark.stages}
            reached={mark.reached}
            outcome={mark.outcome}
            tone={mark.left === "past estimate" ? "over" : "default"}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-[320px] p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        {...hover}
      >
        {goal === null ? <span className="text-xs text-muted-foreground">{mark.label}</span> : <GoalCard goal={goal} />}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A ring split into one segment per stage, filled for each stage done. A
 * met goal fills the whole ring; a goal with no stages, such as an
 * exploration, draws a dashed ring.
 */
export function GoalDonut({
  stages,
  reached,
  outcome = null,
  size = 14,
  stroke = 2.4,
  tone = "default",
  nextTone = null,
}: {
  stages: number;
  reached: number;
  outcome?: "met" | "partly" | "not" | null;
  size?: number;
  stroke?: number;
  tone?: "default" | "over";
  /** Colours the segment being worked on, when set. */
  nextTone?: "blue" | null;
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
  if (stages === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
        <circle cx={centre} cy={centre} r={radius} fill="none" strokeWidth={stroke} className={empty}
          strokeDasharray={`${circumference / 12} ${circumference / 12}`} />
      </svg>
    );
  }
  // A small gap between segments, so each reads as its own stage.
  const gap = stages > 1 ? Math.min(circumference / stages / 3, stroke * 0.9) : 0;
  const length = circumference / stages - gap;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
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
          className={
            index < reached
              ? filled
              : index === reached && nextTone === "blue" && outcome === null
                ? "stroke-blue-500/70"
                : empty
          }
        />
      ))}
    </svg>
  );
}

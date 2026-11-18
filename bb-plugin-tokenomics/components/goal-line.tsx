// The line under a thread's title: the goal, its current stage, and the turns
// left. Resting on it opens a card with the stages, the estimate, and what the
// goal has used so far.
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

/** The compact stage beside a sidebar row's title: "1/3", a check, or "?" for an exploration. */
export function SidebarGoalMark({ label, outcome, left }: { label: string; outcome: "met" | "partly" | "not" | null; left: string | null }) {
  const fraction = /^(\d+) of (\d+)/.exec(label);
  const text = outcome !== null ? null : fraction ? `${fraction[1]}/${fraction[2]}` : label === "Exploring" ? "?" : null;
  const tip = left === null ? label : `${label} · ${left}`;
  return (
    <span
      title={`Goal: ${tip}`}
      className={cn(
        "ml-1.5 inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums leading-none text-muted-foreground",
        left === "past estimate" && "text-amber-600 dark:text-amber-400",
      )}
    >
      {outcome === "met" ? (
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={2} aria-label="Goal met" />
      ) : outcome !== null ? (
        <span>{outcome === "partly" ? "½" : "✕"}</span>
      ) : text === null ? null : (
        <>
          <HugeiconsIcon icon={Target02Icon} size={10} strokeWidth={2} aria-hidden />
          <span>{text}</span>
        </>
      )}
    </span>
  );
}

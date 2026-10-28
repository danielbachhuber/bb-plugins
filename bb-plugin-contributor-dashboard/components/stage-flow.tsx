// The flow of stages at the top of the dashboard: one row per stage, how many
// are in it now, how long it takes, and which way that is moving.
import { Fragment } from "react";

import type { StageKey, StageSummary } from "@/dashboard/contract";
import type { BucketUnit } from "@/dashboard/period";

const BAR = "bg-[#2a78d6] dark:bg-[#3987e5]";
const NUMBER = "text-[#2a78d6] dark:text-[#3987e5]";
const WARN = "text-[#b4530a] dark:text-[#e59a3a]";

/** Hours under a day and minutes under an hour, so nothing reads as "0.0d". */
export function days(value: number): string {
  if (value >= 1) return `${value.toFixed(1)}d`;
  const hours = value * 24;
  if (hours >= 1) return `${Math.round(hours)}h`;
  return value === 0 ? "—" : `${Math.max(1, Math.round(hours * 60))}m`;
}

/** The median in each of the period's buckets, drawn small. Rising is worse, so it is the warning colour. */
function Trend({ points }: { points: readonly number[] }) {
  const usable = points.filter((point) => point > 0);
  if (usable.length < 2) return <span className="text-[11px] text-muted-foreground">—</span>;
  const high = Math.max(...usable);
  const low = Math.min(...usable);
  const span = high - low || 1;
  const path = points
    .map((point, index) => `${(index / (points.length - 1)) * 56},${14 - ((point - low) / span) * 12}`)
    .join(" ");
  const rising = usable[usable.length - 1] > usable[0];
  return (
    <svg
      width="56"
      height="16"
      viewBox="0 0 56 16"
      role="img"
      aria-label={rising ? "rising" : "falling"}
      className={rising ? "text-destructive" : "text-[#1baf7a] dark:text-[#199e70]"}
    >
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Mark({ at, className }: { at: number; className: string }) {
  return (
    <span
      className={`absolute ${className}`}
      style={{ left: `${Math.min(100, at * 100)}%`, width: 2, height: 16, background: "currentColor" }}
    />
  );
}

const GROUPS: ReadonlyArray<{ source: StageSummary["source"]; title: string; covers: string }> = [
  { source: "issue", title: "Issues", covers: "Identify and Define" },
  { source: "pullRequest", title: "Pull requests", covers: "Execute, Verify and Release" },
];

/** How long the longest p90 in a group is, rounded up to a readable figure. */
type StagePart = NonNullable<StageSummary["byAsked"]>["team"];

function scaleOf(stages: readonly StageSummary[]): number {
  return Math.max(
    0.5,
    ...stages.flatMap((stage) => [stage.p90, stage.byAsked?.team.p90 ?? 0, stage.byAsked?.person.p90 ?? 0]),
  );
}

/** One line of the table: a stage, or the part of Code review asked of a team only or of a person. */
function StageRow({
  label,
  measures,
  part,
  scale,
  onOpen,
  sub = false,
  warn = false,
}: {
  label: string;
  measures: string;
  part: StagePart;
  scale: number;
  onOpen: () => void;
  /** Drawn indented under the stage it divides. */
  sub?: boolean;
  /** Its waiting count is drawn amber while anything waits. */
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className={`w-44 shrink-0 ${sub ? "pl-3" : ""}`}>
        <button
          type="button"
          onClick={onOpen}
          className={`block cursor-pointer text-left hover:underline ${sub ? "" : "font-medium"}`}
        >
          {label}
        </button>
        <span className="block text-[11px] leading-tight text-muted-foreground">{measures}</span>
      </span>
      <span
        className={`w-16 shrink-0 text-right tabular-nums ${warn && part.waiting > 0 ? `font-semibold ${WARN}` : "text-muted-foreground"}`}
      >
        {part.waiting}
      </span>
      <span className="relative flex h-5 min-w-0 flex-1 items-center">
        <span className="absolute inset-x-0 h-px bg-border" />
        <span
          className={`absolute rounded-sm ${BAR}`}
          style={{ width: `${(part.median / scale) * 100}%`, height: sub ? 6 : 8 }}
        />
        <Mark at={part.p75 / scale} className="text-muted-foreground" />
        <Mark at={part.p90 / scale} className="text-destructive" />
      </span>
      <span className={`w-14 shrink-0 text-right font-medium tabular-nums ${NUMBER}`}>{days(part.median)}</span>
      <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{days(part.p75)}</span>
      <span className="w-12 shrink-0 text-right tabular-nums text-destructive">{days(part.p90)}</span>
      <span className="w-14 shrink-0">
        <Trend points={part.weekly} />
      </span>
    </div>
  );
}

/** What the trend column counts, one point per bucket. */
const TREND: Record<BucketUnit, string> = { day: "daily", week: "weekly", month: "monthly" };

/**
 * One group's stages as rows: how many are in each now, how long it takes,
 * and which way that is moving. The group shares one scale, named in the
 * header, because issue stages run in weeks and pull request stages in hours.
 */
export function StageTable({
  stages,
  unit,
  onOpenStage,
}: {
  stages: readonly StageSummary[];
  /** What one point of the trend counts. */
  unit: BucketUnit;
  onOpenStage: (stage: StageKey) => void;
}) {
  const scale = scaleOf(stages);
  return (
    <div>
      <div className="mt-3 flex items-end gap-3 border-b border-border pb-1 text-[11px] text-muted-foreground">
        <span className="w-44 shrink-0" />
        <span className="w-16 shrink-0 text-right">Now</span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`inline-block rounded-sm ${BAR}`} style={{ width: 14, height: 6 }} />
          median
          <span className="ml-2 inline-block bg-muted-foreground" style={{ width: 2, height: 10 }} />
          p75
          <span className="ml-2 inline-block bg-destructive" style={{ width: 2, height: 10 }} />
          p90
          <span className="ml-auto">scale to {days(scale)}</span>
        </span>
        <span className="w-14 shrink-0 text-right">median</span>
        <span className="w-12 shrink-0 text-right">p75</span>
        <span className="w-12 shrink-0 text-right">p90</span>
        <span className="w-14 shrink-0">{TREND[unit]}</span>
      </div>
      <div className="mt-1.5 space-y-2">
        {stages.map((stage) => (
          <Fragment key={stage.key}>
            <StageRow label={stage.label} measures={stage.measures} part={stage} scale={scale} onOpen={() => onOpenStage(stage.key)} />
            {stage.byAsked === undefined ? null : (
              <>
                <StageRow
                  label="Asked of a team only"
                  measures="no one named, until anyone reviews"
                  part={stage.byAsked.team}
                  scale={scale}
                  onOpen={() => onOpenStage(stage.key)}
                  sub
                  warn
                />
                <StageRow
                  label="Asked of a person"
                  measures="someone named, until anyone reviews"
                  part={stage.byAsked.person}
                  scale={scale}
                  onOpen={() => onOpenStage(stage.key)}
                  sub
                />
              </>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Both groups under one heading, as the page drew them before it had sections. Explore stories still use it. */
export function StageFlowSection({
  stages,
  periodLabel,
  unit,
  onOpenStage,
}: {
  stages: readonly StageSummary[];
  /** How long the period is, for the heading, such as "six weeks". */
  periodLabel: string;
  unit: BucketUnit;
  onOpenStage: (stage: StageKey) => void;
}) {
  return (
    <section className="mt-6" aria-labelledby="stage-flow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="stage-flow" className="text-base font-semibold">
          Identify → Define → Execute → Verify → Release
        </h2>
        <span className="text-xs text-muted-foreground">Business days, over {periodLabel}</span>
      </div>
      {GROUPS.map((group) => {
        const inGroup = stages.filter((stage) => stage.source === group.source);
        if (inGroup.length === 0) return null;
        return (
          <div key={group.source}>
            <h3 className="mt-3 text-xs font-semibold">
              {group.title} <span className="font-normal text-muted-foreground">{group.covers}</span>
            </h3>
            <StageTable stages={inGroup} unit={unit} onOpenStage={onOpenStage} />
          </div>
        );
      })}
    </section>
  );
}

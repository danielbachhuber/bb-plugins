// The flow of stages at the top of the dashboard: one row per stage, how many
// are in it now, how long it takes, and which way that is moving.
import type { StageKey, StageSummary } from "@/dashboard/contract";

const BAR = "bg-[#2a78d6] dark:bg-[#3987e5]";
const NUMBER = "text-[#2a78d6] dark:text-[#3987e5]";

/** Hours under a day and minutes under an hour, so nothing reads as "0.0d". */
export function days(value: number): string {
  if (value >= 1) return `${value.toFixed(1)}d`;
  const hours = value * 24;
  if (hours >= 1) return `${Math.round(hours)}h`;
  return value === 0 ? "—" : `${Math.max(1, Math.round(hours * 60))}m`;
}

/** The weekly median, drawn small. Rising is worse, so it is the warning colour. */
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
function scaleOf(stages: readonly StageSummary[]): number {
  return Math.max(0.5, ...stages.map((stage) => stage.p90));
}

export function StageFlowSection({
  stages,
  periodLabel,
  onOpenStage,
}: {
  stages: readonly StageSummary[];
  /** How long the period is, for the heading, such as "six weeks". */
  periodLabel: string;
  onOpenStage: (stage: StageKey) => void;
}) {
  const groups = GROUPS.map((group) => ({
    ...group,
    stages: stages.filter((stage) => stage.source === group.source),
  })).filter((group) => group.stages.length > 0);

  return (
    <section className="mt-6" aria-labelledby="stage-flow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="stage-flow" className="text-base font-semibold">
          Identify → Define → Execute → Verify → Release
        </h2>
        <span className="text-xs text-muted-foreground">Business days, over {periodLabel}</span>
      </div>

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
        </span>
        <span className="w-14 shrink-0 text-right">median</span>
        <span className="w-12 shrink-0 text-right">p75</span>
        <span className="w-12 shrink-0 text-right">p90</span>
        <span className="w-14 shrink-0">weekly</span>
      </div>

      {groups.map((group) => {
        // Issue stages run in weeks and pull request stages in hours, so a
        // shared scale would flatten the second group into its first pixel.
        const scale = scaleOf(group.stages);
        return (
          <div key={group.source}>
            <div className="mt-3 flex items-baseline gap-2">
              <h3 className="text-xs font-semibold">{group.title}</h3>
              <span className="text-[11px] text-muted-foreground">
                {group.covers} · scale to {days(scale)}
              </span>
            </div>
            <div className="mt-1.5 space-y-2">
              {group.stages.map((stage) => (
                <div key={stage.key} className="flex items-center gap-3 text-xs">
                  <span className="w-44 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenStage(stage.key)}
                      className="block cursor-pointer text-left font-medium hover:underline"
                    >
                      {stage.label}
                    </button>
                    <span className="block text-[11px] leading-tight text-muted-foreground">{stage.measures}</span>
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">{stage.waiting}</span>
                  <span className="relative flex h-5 min-w-0 flex-1 items-center">
                    <span className="absolute inset-x-0 h-px bg-border" />
                    <span
                      className={`absolute rounded-sm ${BAR}`}
                      style={{ width: `${(stage.median / scale) * 100}%`, height: 8 }}
                    />
                    <Mark at={stage.p75 / scale} className="text-muted-foreground" />
                    <Mark at={stage.p90 / scale} className="text-destructive" />
                  </span>
                  <span className={`w-14 shrink-0 text-right font-medium tabular-nums ${NUMBER}`}>
                    {days(stage.median)}
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                    {days(stage.p75)}
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-destructive">{days(stage.p90)}</span>
                  <span className="w-14 shrink-0">
                    <Trend points={stage.weekly} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <p className="mt-2 text-[11px] text-muted-foreground">
        Half pass a stage within its median; a quarter take longer than its p75, a tenth longer than its p90. Each
        group has its own scale, so a bar in one is not comparable with a bar in the other. Open a stage to see what
        is in it.
      </p>
    </section>
  );
}

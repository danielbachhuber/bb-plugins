import { useState } from "react";

/**
 * The past hour of a plugin's syncs and the account's GitHub budget, as
 * `gh-shared`'s `createSyncUsage` reports them. The shape is repeated here
 * rather than imported, because this package cannot depend on gh-shared.
 */
export interface SyncUsage {
  syncs: { at: number; points: number | null; calls: number; ms: number }[];
  budget: { used: number; limit: number; resetAt: number } | null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const CHART_WIDTH = 368;
const CHART_HEIGHT = 80;
/** Room left of the chart for its axis labels, and above and below it. */
const AXIS_WIDTH = 34;
const AXIS_PAD = 6;
const BAR_WIDTH = 6;

const fmt = (n: number) => n.toLocaleString("en-US");

function clock(time: number): string {
  return new Date(time).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A round top for the axis: 4, 10, 120, 1,500. */
function roundUp(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

function plural(count: number, word: string): string {
  return `${fmt(count)} ${count === 1 ? word : `${word}s`}`;
}

/** The hour's measured points, and how many syncs could not be measured. */
export function hourTotals(usage: SyncUsage): {
  points: number;
  unmeasured: number;
} {
  let points = 0;
  let unmeasured = 0;
  for (const sync of usage.syncs) {
    if (sync.points === null) unmeasured += 1;
    else points += sync.points;
  }
  return { points, unmeasured };
}

/**
 * One bar per sync, placed at the time it ran across the past hour, so a
 * missed sync shows as a gap and a Refresh between two scheduled ones as a
 * bar out of step.
 */
function SyncBars({
  usage,
  now,
  hovered,
  onHover,
}: {
  usage: SyncUsage;
  now: number;
  hovered: number | null;
  onHover: (index: number | null) => void;
}) {
  const top = roundUp(
    Math.max(0, ...usage.syncs.map((sync) => sync.points ?? 0)),
  );
  const plot = CHART_HEIGHT - 2 * AXIS_PAD;
  const start = now - HOUR;
  const x = (time: number) =>
    AXIS_WIDTH +
    ((time - start) / HOUR) * (CHART_WIDTH - AXIS_WIDTH - BAR_WIDTH);
  const y = (value: number) => AXIS_PAD + plot - (value / top) * plot;
  return (
    <svg
      width={CHART_WIDTH}
      height={CHART_HEIGHT}
      aria-hidden
      onMouseLeave={() => onHover(null)}
    >
      {[0, top / 2, top].map((tick) => (
        <g key={tick}>
          <line
            x1={AXIS_WIDTH}
            x2={CHART_WIDTH}
            y1={Math.round(y(tick)) - 0.5}
            y2={Math.round(y(tick)) - 0.5}
            stroke="currentColor"
            opacity={tick === 0 ? 0.2 : 0.1}
          />
          <text
            x={AXIS_WIDTH - 6}
            y={y(tick)}
            dy="0.32em"
            textAnchor="end"
            className="fill-muted-foreground text-[10px] tabular-nums"
          >
            {fmt(tick)}
          </text>
        </g>
      ))}
      {usage.syncs.map((sync, index) => {
        // An unmeasured sync still gets a stub, so it is not mistaken for no sync.
        const height =
          sync.points === null ? 2 : Math.max(1, (sync.points / top) * plot);
        return (
          <g key={sync.at}>
            <rect
              x={x(sync.at)}
              y={AXIS_PAD + plot - height}
              width={BAR_WIDTH}
              height={height}
              rx={1}
              fill="currentColor"
              opacity={
                (hovered === null || hovered === index ? 1 : 0.45) *
                (sync.points === null ? 0.4 : 1)
              }
            />
            <rect
              x={x(sync.at) - 3}
              y={0}
              width={BAR_WIDTH + 6}
              height={CHART_HEIGHT}
              fill="transparent"
              onMouseEnter={() => onHover(index)}
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * What the sync label opens: the hour's GitHub points for this plugin, a bar
 * per sync, and what the account has left. Display only.
 */
export function SyncUsageSummary({
  usage,
  now,
  initialHovered = null,
}: {
  usage: SyncUsage;
  now: number;
  /** For stories, so the readout under the chart can be drawn filled in. */
  initialHovered?: number | null;
}) {
  const [hovered, setHovered] = useState<number | null>(initialHovered);
  const { points, unmeasured } = hourTotals(usage);
  const sync = hovered === null ? undefined : usage.syncs[hovered];
  const budget =
    usage.budget !== null && usage.budget.resetAt > now ? usage.budget : null;

  return (
    <div className="space-y-4 text-sm">
      {usage.syncs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No syncs in the past hour.
        </p>
      ) : (
        <div>
          <p className="text-xl font-semibold tabular-nums">
            {fmt(points)}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              GitHub points over {plural(usage.syncs.length, "sync")} in the
              past hour
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {clock(now - HOUR)} to {clock(now)}
            {unmeasured === 0
              ? null
              : `, not counting ${plural(unmeasured, "sync")} that couldn't be measured`}
          </p>
        </div>
      )}

      {usage.syncs.length === 0 ? null : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Points per sync</p>
          <div className="text-foreground/70">
            <SyncBars
              usage={usage}
              now={now}
              hovered={hovered}
              onHover={setHovered}
            />
          </div>
          <p className="flex pl-[34px] text-[11px] text-muted-foreground">
            <span className="flex-1">{clock(now - HOUR)}</span>
            <span>{clock(now)}</span>
          </p>
          <div className="min-h-[52px] rounded-md bg-muted/50 px-2.5 py-2 text-xs">
            {sync === undefined ? (
              <p className="text-muted-foreground">
                Hover a bar to see that sync.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="flex font-medium">
                  <span className="flex-1">{clock(sync.at)} sync</span>
                  <span className="tabular-nums">
                    {sync.points === null
                      ? "not measured"
                      : plural(sync.points, "point")}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {plural(sync.calls, "call")} in {(sync.ms / 1_000).toFixed(1)}
                  s
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {budget === null ? null : (
        <p className="text-xs text-muted-foreground">
          GitHub allows {fmt(budget.limit)} points an hour for your account,
          across every plugin and gh command. It has{" "}
          <span className="tabular-nums text-foreground">
            {fmt(Math.max(0, budget.limit - budget.used))}
          </span>{" "}
          left, and resets in{" "}
          {Math.max(1, Math.ceil((budget.resetAt - now) / MINUTE))} min.
        </p>
      )}
    </div>
  );
}

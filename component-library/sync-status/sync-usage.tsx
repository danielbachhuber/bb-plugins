import { useState } from "react";

/**
 * The past hour of a plugin's syncs and the account's GitHub budget, as
 * `gh-shared`'s `createSyncUsage` reports them. The shape is repeated here
 * rather than imported, because this package cannot depend on gh-shared.
 *
 * A plugin that calls more than one service, as Now does, gives each sync
 * its calls by service and also reports the calls it made between syncs.
 * The summary then counts calls rather than GitHub points, since points mean
 * nothing to Gmail or Todoist.
 */
export interface SyncUsage {
  syncs: {
    at: number;
    /** GitHub points, or null when they could not be measured. */
    points: number | null;
    calls: number;
    ms: number;
    /** Calls by service, such as `{ Gmail: 34, Todoist: 3 }`. */
    services?: Record<string, number>;
  }[];
  budget: { used: number; limit: number; resetAt: number } | null;
  /** Calls by service made outside a sync in the past hour, such as from a click. */
  otherCalls?: Record<string, number>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The chart's width in a summary 400 pixels wide, less its padding and border. */
export const CHART_WIDTH = 366;
const CHART_HEIGHT = 80;
/** Room left of the chart for its axis labels, and above and below it. */
const AXIS_WIDTH = 34;
const AXIS_PAD = 6;
const BAR_WIDTH = 6;

/** One color per service, given out in order of the hour's calls. */
const SERVICE_COLORS = ["#2a9fd6", "#7c6cf2", "#e0a100", "#3fb27f", "#d0703c", "#8a8f98"];

const fmt = (n: number) => n.toLocaleString("en-US");

function clock(time: number): string {
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
export function hourTotals(usage: SyncUsage): { points: number; unmeasured: number } {
  let points = 0;
  let unmeasured = 0;
  for (const sync of usage.syncs) {
    if (sync.points === null) unmeasured += 1;
    else points += sync.points;
  }
  return { points, unmeasured };
}

/** Each service's calls over the hour's syncs, most first. */
export function serviceTotals(usage: SyncUsage): { name: string; calls: number }[] {
  const totals = new Map<string, number>();
  for (const sync of usage.syncs) {
    for (const [name, calls] of Object.entries(sync.services ?? {})) {
      totals.set(name, (totals.get(name) ?? 0) + calls);
    }
  }
  return [...totals].map(([name, calls]) => ({ name, calls })).sort((a, b) => b.calls - a.calls);
}

/**
 * "Gmail 34 · Todoist 3 · GitHub 1 (2 points)", leaving out services with
 * none. GitHub's points go beside its calls, since only GitHub counts them.
 */
function byService(services: Record<string, number>, order: readonly string[], points = 0): string {
  return [...order, ...Object.keys(services).filter((name) => !order.includes(name))]
    .filter((name) => (services[name] ?? 0) > 0)
    .map((name) => `${name} ${fmt(services[name]!)}${name === "GitHub" && points > 0 ? ` (${plural(points, "point")})` : ""}`)
    .join(" · ");
}

/**
 * One bar per sync, placed at the time it ran across the past hour, so a
 * missed sync shows as a gap and a Refresh between two scheduled ones as a
 * bar out of step. With services, each bar stacks its calls by service.
 */
function SyncBars({
  usage,
  now,
  width,
  colors,
  hovered,
  onHover,
}: {
  usage: SyncUsage;
  now: number;
  width: number;
  /** Service to color; null draws points. */
  colors: Map<string, string> | null;
  hovered: number | null;
  onHover: (index: number | null) => void;
}) {
  const value = (sync: SyncUsage["syncs"][number]) => (colors === null ? (sync.points ?? 0) : sync.calls);
  const top = roundUp(Math.max(0, ...usage.syncs.map(value)));
  const plot = CHART_HEIGHT - 2 * AXIS_PAD;
  const start = now - HOUR;
  const x = (time: number) => AXIS_WIDTH + ((time - start) / HOUR) * (width - AXIS_WIDTH - BAR_WIDTH);
  const y = (amount: number) => AXIS_PAD + plot - (amount / top) * plot;
  return (
    <svg width={width} height={CHART_HEIGHT} aria-hidden onMouseLeave={() => onHover(null)}>
      {[0, top / 2, top].map((tick) => (
        <g key={tick}>
          <line
            x1={AXIS_WIDTH}
            x2={width}
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
        const faded = hovered === null || hovered === index ? 1 : 0.45;
        let segments: { color: string; amount: number }[];
        if (colors === null) {
          segments = [{ color: "currentColor", amount: sync.points ?? 0 }];
        } else {
          segments = [...colors].map(([name, color]) => ({ color, amount: sync.services?.[name] ?? 0 }));
        }
        let base = 0;
        return (
          <g key={sync.at} opacity={faded}>
            {colors === null && sync.points === null ? (
              // An unmeasured sync still gets a stub, so it is not mistaken for no sync.
              <rect x={x(sync.at)} y={y(0) - 2} width={BAR_WIDTH} height={2} rx={1} fill="currentColor" opacity={0.4} />
            ) : (
              segments.map(({ color, amount }, part) => {
                if (amount <= 0) return null;
                const top_ = y(base + amount);
                const bottom = y(base);
                base += amount;
                return (
                  <rect
                    key={part}
                    x={x(sync.at)}
                    y={top_}
                    width={BAR_WIDTH}
                    height={Math.max(1, bottom - top_)}
                    rx={colors === null ? 1 : 0}
                    fill={color}
                  />
                );
              })
            )}
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
 * What the sync label opens: the hour's GitHub points for this plugin, or
 * its calls by service, a bar per sync, and what the GitHub account has
 * left. Display only.
 */
export function SyncUsageSummary({
  usage,
  now,
  initialHovered = null,
  chartWidth = CHART_WIDTH,
}: {
  usage: SyncUsage;
  now: number;
  /** The chart's width, narrower when the summary has less room than usual. */
  chartWidth?: number;
  /** For stories, so the readout under the chart can be drawn filled in. */
  initialHovered?: number | null;
}) {
  const [hovered, setHovered] = useState<number | null>(initialHovered);
  const { points, unmeasured } = hourTotals(usage);
  const services = usage.syncs.some((sync) => sync.services !== undefined) ? serviceTotals(usage) : null;
  const colors =
    services === null
      ? null
      : new Map(services.map(({ name }, index) => [name, SERVICE_COLORS[index % SERVICE_COLORS.length]!]));
  const order = services?.map(({ name }) => name) ?? [];
  const calls = usage.syncs.reduce((total, sync) => total + sync.calls, 0);
  const sync = hovered === null ? undefined : usage.syncs[hovered];
  const budget = usage.budget !== null && usage.budget.resetAt > now ? usage.budget : null;
  const other = usage.otherCalls ?? {};
  const otherTotal = Object.values(other).reduce((total, count) => total + count, 0);

  return (
    <div className="space-y-4 text-sm">
      {usage.syncs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No syncs in the past hour.</p>
      ) : (
        <div>
          <p className="text-xl font-semibold tabular-nums">
            {fmt(colors === null ? points : calls)}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              {colors === null ? "GitHub points" : calls === 1 ? "call" : "calls"} over{" "}
              {plural(usage.syncs.length, "sync")} in the past hour
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {clock(now - HOUR)} to {clock(now)}
            {colors !== null || unmeasured === 0
              ? null
              : `, not counting ${plural(unmeasured, "sync")} that couldn't be measured`}
          </p>
        </div>
      )}

      {usage.syncs.length === 0 ? null : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{colors === null ? "Points per sync" : "Calls per sync"}</p>
          <div className="text-foreground/70">
            <SyncBars usage={usage} now={now} width={chartWidth} colors={colors} hovered={hovered} onHover={setHovered} />
          </div>
          <p className="flex pl-[34px] text-[11px] text-muted-foreground">
            <span className="flex-1">{clock(now - HOUR)}</span>
            <span>{clock(now)}</span>
          </p>
          {services === null || colors === null ? null : (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pl-[34px] text-[11px] text-muted-foreground">
              {services.map(({ name, calls: count }) => (
                <span key={name} className="flex items-center gap-1">
                  <span className="size-2 rounded-sm" style={{ background: colors.get(name) }} aria-hidden />
                  {name}
                  <span className="tabular-nums text-foreground">{fmt(count)}</span>
                </span>
              ))}
            </div>
          )}
          <div className="min-h-[52px] rounded-md bg-muted/50 px-2.5 py-2 text-xs">
            {sync === undefined ? (
              <p className="text-muted-foreground">Hover a bar to see that sync.</p>
            ) : (
              <div className="space-y-1">
                <p className="flex font-medium">
                  <span className="flex-1">{clock(sync.at)} sync</span>
                  <span className="tabular-nums">
                    {colors !== null
                      ? plural(sync.calls, "call")
                      : sync.points === null
                        ? "not measured"
                        : plural(sync.points, "point")}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {colors === null
                    ? `${plural(sync.calls, "call")} in ${(sync.ms / 1_000).toFixed(1)}s`
                    : `${byService(sync.services ?? {}, order, sync.points ?? 0)}, in ${(sync.ms / 1_000).toFixed(1)}s`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {otherTotal === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          Plus {plural(otherTotal, "call")} outside syncs, from buttons on the page: {byService(other, order)}.
        </p>
      )}

      {budget === null ? null : (
        <p className="text-xs text-muted-foreground">
          {colors === null || points === 0
            ? null
            : `This hour's GitHub calls cost ${plural(points, "point")}. `}
          GitHub allows {fmt(budget.limit)} points an hour for your account, across every plugin and gh command.
          It has <span className="tabular-nums text-foreground">{fmt(Math.max(0, budget.limit - budget.used))}</span>{" "}
          left, and resets in {Math.max(1, Math.ceil((budget.resetAt - now) / MINUTE))} min.
        </p>
      )}
    </div>
  );
}

// The thread header's token count: a button with a sparkline of the thread's
// token use over time, opening a summary of when its tokens went and which of
// your messages set them off. Display only.
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { totalOf, type Tokens } from "@/usage/breakdown";
import type { TurnDetail, UsageAt } from "@/usage/contract";
import { formatTokens, timeBuckets, type TimeBucket } from "@/usage/series";

import { PARTS } from "./usage-chart";

export interface ThreadTokens extends Tokens {
  total: number;
  turns: number;
  /** The latest usage rows, oldest first. */
  recent: UsageAt[];
}

/** Buckets in the header's sparkline and the summary's chart. */
const SPARK_BUCKETS = 20;
const CHART_BUCKETS = 36;
/** Turns the summary names under "Biggest turns". */
const BIGGEST = 3;

/**
 * One bar per time bucket, scaled to the largest, in the current text color.
 * It draws each bucket's total, so it stays neutral rather than taking the
 * color of one of the three parts. An empty bucket draws nothing, so idle
 * stretches read as gaps.
 */
function Spark({
  buckets,
  width,
  height,
  gap,
  active,
  onHover,
}: {
  buckets: readonly TimeBucket[];
  width: number;
  height: number;
  gap: number;
  active?: number | null;
  onHover?: (index: number | null) => void;
}) {
  const most = Math.max(1, ...buckets.map(totalOf));
  const slot = buckets.length === 0 ? 0 : width / buckets.length;
  const barWidth = Math.max(1, slot - gap);
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0" onMouseLeave={() => onHover?.(null)}>
      <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="currentColor" opacity={0.2} />
      {buckets.map((bucket, index) => {
        const total = totalOf(bucket);
        // A bucket too small to see still gets one pixel, so every busy stretch shows.
        const barHeight = total === 0 ? 0 : Math.max(1, (total / most) * height);
        return (
          <g key={bucket.start}>
            {barHeight === 0 ? null : (
              <rect
                x={index * slot}
                y={height - barHeight}
                width={barWidth}
                height={barHeight}
                rx={Math.min(1, barWidth / 2)}
                fill="currentColor"
                opacity={active === undefined || active === null || active === index ? 1 : 0.45}
              />
            )}
            {onHover === undefined ? null : (
              <rect
                x={index * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                onMouseEnter={() => onHover(index)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function day(time: number): string {
  return new Date(time).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function clock(time: number): string {
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "Thu, Sep 24, 10:20 AM to 1:27 PM", naming the day once when both fall on it. */
export function spanLabel(first: number, last: number): string {
  if (day(first) === day(last)) return `${day(first)}, ${clock(first)} to ${clock(last)}`;
  return `${day(first)}, ${clock(first)} to ${day(last)}, ${clock(last)}`;
}

/** A clock time, with the day in front when it is not the day `reference` falls on. */
function timeLabel(time: number, reference: number): string {
  return day(time) === day(reference) ? clock(time) : `${day(time)}, ${clock(time)}`;
}

function percent(part: number, total: number): string {
  if (total === 0) return "0%";
  const value = (part / total) * 100;
  return value > 0 && value < 1 ? "<1%" : `${Math.round(value)}%`;
}

function duration(turn: TurnDetail): string | null {
  if (turn.endedAt === null) return "still running";
  const minutes = Math.round((turn.endedAt - turn.startedAt) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
}

/**
 * The start of a chart ending at `to`: `from`, or earlier when that would give
 * fewer than `count` one-minute buckets. A thread whose usage all landed at
 * once then draws a thin bar at the right, not one bar the chart's width.
 */
function paddedFrom(from: number, to: number, count: number): number {
  return Math.min(from, to - (count - 1) * 60_000);
}

/** The header sparkline's buckets: the recorded rows, up to the last. */
export function sparkBuckets(recent: readonly UsageAt[]): TimeBucket[] {
  const first = recent[0];
  const last = recent.at(-1);
  if (first === undefined || last === undefined) return [];
  return timeBuckets(recent, (row) => row.at, paddedFrom(first.at, last.at, SPARK_BUCKETS), last.at, SPARK_BUCKETS);
}

function TurnLine({ turn, total, reference }: { turn: TurnDetail; total: number; reference: number }) {
  const tokens = totalOf(turn);
  const meta = [timeLabel(turn.startedAt, reference), duration(turn), `${percent(tokens, total)} of the thread`];
  return (
    <li className="flex gap-3 text-xs">
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", turn.prompt === null && "text-muted-foreground")}>
          {turn.prompt ?? (turn.turnId === null ? "Before the first recorded turn" : "Continued without a new message")}
        </span>
        <span className="block truncate text-muted-foreground">{meta.join(" · ")}</span>
      </span>
      <span className="shrink-0 tabular-nums">{formatTokens(tokens)}</span>
    </li>
  );
}

/** A bucket to show hovered on first render: an index, or the one that used the most. */
export type InitialHover = number | "largest" | null;

export function ThreadTokenSummary({
  usage,
  turns,
  onOpenPage,
  initialHovered = null,
}: {
  usage: ThreadTokens;
  /** Null while the turns are loading. */
  turns: TurnDetail[] | null;
  onOpenPage?: () => void;
  /** For stories, so the readout under the chart can be drawn filled in. */
  initialHovered?: InitialHover;
}) {
  const [hoverState, setHovered] = useState<InitialHover>(initialHovered);
  const recorded = totalOf(usage);
  const unrecorded = usage.total - recorded;
  const first = usage.recent[0];
  const last = usage.recent.at(-1);

  // Until the turns load, the chart draws the recorded rows on their own.
  const start = turns?.[0]?.startedAt ?? first?.at;
  const to = turns === null ? last?.at : turns.reduce((latest, turn) => Math.max(latest, turn.usageAt), start ?? 0);
  const from = start === undefined || to === undefined ? undefined : paddedFrom(start, to, CHART_BUCKETS);
  const buckets =
    from === undefined || to === undefined
      ? []
      : turns === null
        ? timeBuckets(usage.recent, (row) => row.at, from, to, CHART_BUCKETS)
        : timeBuckets(turns, (turn) => turn.usageAt, from, to, CHART_BUCKETS);
  const hovered =
    hoverState === "largest"
      ? buckets.reduce((best, bucket, index) => (totalOf(bucket) > totalOf(buckets[best]!) ? index : best), 0)
      : hoverState;
  const hoveredBucket = hovered === null ? undefined : buckets[hovered];
  const biggest = turns === null ? [] : [...turns].sort((a, b) => totalOf(b) - totalOf(a)).slice(0, BIGGEST);
  const inBucket =
    hoveredBucket === undefined || turns === null
      ? []
      : hoveredBucket.items
          .map((index) => turns[index]!)
          .filter((turn) => totalOf(turn) > 0)
          .sort((a, b) => totalOf(b) - totalOf(a))
          .slice(0, BIGGEST);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xl font-semibold tabular-nums">
          {formatTokens(usage.total)}
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
            tokens over {usage.turns} {usage.turns === 1 ? "turn" : "turns"}
          </span>
        </p>
        {first === undefined || last === undefined ? null : (
          <p className="text-xs text-muted-foreground">{spanLabel(start ?? first.at, last.at)}</p>
        )}
      </div>

      {buckets.length === 0 || from === undefined || to === undefined ? null : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Tokens over time</p>
          <div className="text-foreground/70">
            <Spark
              buckets={buckets}
              width={368}
              height={64}
              gap={buckets.length > 24 ? 1 : 2}
              active={hovered}
              onHover={setHovered}
            />
          </div>
          <p className="flex text-[11px] text-muted-foreground">
            <span className="flex-1">{clock(from)}</span>
            <span>{timeLabel(to, from)}</span>
          </p>
          <div className="min-h-[52px] rounded-md bg-muted/50 px-2.5 py-2">
            {hoveredBucket === undefined ? (
              <p className="text-xs text-muted-foreground">Hover a bar to see the messages behind it.</p>
            ) : (
              <div className="space-y-1.5">
                <p className="flex text-xs font-medium">
                  <span className="flex-1">
                    {timeLabel(hoveredBucket.start, from)} to {clock(hoveredBucket.end)}
                  </span>
                  <span className="tabular-nums">{formatTokens(totalOf(hoveredBucket))}</span>
                </p>
                {totalOf(hoveredBucket) === 0 ? (
                  <p className="text-xs text-muted-foreground">No tokens used.</p>
                ) : turns === null ? (
                  <p className="text-xs text-muted-foreground">Loading the messages…</p>
                ) : (
                  <ul className="space-y-1.5">
                    {inBucket.map((turn) => (
                      <TurnLine key={turn.turnId ?? "before"} turn={turn} total={usage.total} reference={from} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {turns === null || biggest.length < 2 ? null : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Biggest turns</p>
          <ul className="space-y-1.5">
            {biggest.map((turn) => (
              <TurnLine key={turn.turnId ?? "before"} turn={turn} total={usage.total} reference={from ?? turn.startedAt} />
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {PARTS.map((part) =>
            usage[part.key] > 0 ? (
              <span key={part.key} className={part.swatch} style={{ flexGrow: usage[part.key], minWidth: 2 }} />
            ) : null,
          )}
        </div>
        {PARTS.map((part) => (
          <p key={part.key} className="flex items-center gap-2 text-xs">
            <span className={cn("size-2.5 rounded-sm", part.swatch)} aria-hidden />
            <span className="flex-1 text-muted-foreground">{part.label}</span>
            <span className="tabular-nums">{usage[part.key].toLocaleString()}</span>
            <span className="w-9 text-right tabular-nums text-muted-foreground">{percent(usage[part.key], recorded)}</span>
          </p>
        ))}
        {unrecorded > 0 ? (
          <p className="text-xs text-muted-foreground">
            Plus {unrecorded.toLocaleString()} from earlier turns that bb deleted before Tokenomics could record them.
          </p>
        ) : null}
      </div>

      {onOpenPage === undefined ? null : (
        <Button variant="outline" size="sm" className="w-full" onClick={onOpenPage}>
          Open Tokenomics
        </Button>
      )}
    </div>
  );
}

export function ThreadTokenCount({
  usage,
  turns,
  onOpen,
  onOpenPage,
  isCompactViewport = false,
  defaultOpen = false,
  initialHovered,
}: {
  usage: ThreadTokens;
  turns: TurnDetail[] | null;
  /** Called when the summary opens, so the turns load only when wanted. */
  onOpen?: () => void;
  onOpenPage?: () => void;
  isCompactViewport?: boolean;
  /** Open on first render, for stories. */
  defaultOpen?: boolean;
  initialHovered?: InitialHover;
}) {
  return (
    <Popover defaultOpen={defaultOpen} onOpenChange={(open) => (open ? onOpen?.() : undefined)}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 cursor-pointer gap-1.5 px-2 tabular-nums"
          aria-label={`${formatTokens(usage.total)} tokens used by this thread. Show the summary.`}
        >
          {isCompactViewport ? null : (
            <span className="text-muted-foreground">
              <Spark buckets={sparkBuckets(usage.recent)} width={40} height={14} gap={1} />
            </span>
          )}
          <span>{formatTokens(usage.total)}</span>
          <span className="text-muted-foreground">tokens</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] p-4">
        <ThreadTokenSummary usage={usage} turns={turns} onOpenPage={onOpenPage} initialHovered={initialHovered} />
      </PopoverContent>
    </Popover>
  );
}

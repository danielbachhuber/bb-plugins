// The thread header's token count: a button with a sparkline of the thread's
// recent turns, opening a summary of where its tokens went. Display only.
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { totalOf } from "@/usage/breakdown";
import type { TurnUsage } from "@/usage/contract";
import { formatTokens } from "@/usage/series";

import { PARTS } from "./usage-chart";

export interface ThreadTokens {
  input: number;
  cacheRead: number;
  output: number;
  total: number;
  turns: number;
  /** The latest turns, oldest first. */
  recent: TurnUsage[];
}

/** Turns the header's sparkline draws; the summary draws all of `recent`. */
const SPARK_TURNS = 24;

/**
 * One bar per turn, scaled to the largest, in the current text color. It
 * draws each turn's total, so it stays neutral rather than taking the color of
 * one of the three parts.
 */
function Spark({
  turns,
  width,
  height,
  gap,
  maxSlot = Infinity,
  active,
  onHover,
}: {
  turns: readonly TurnUsage[];
  width: number;
  height: number;
  gap: number;
  /** The widest a turn's slot gets; fewer turns than fill the width sit at the right, newest last. */
  maxSlot?: number;
  active?: number | null;
  onHover?: (index: number | null) => void;
}) {
  const most = Math.max(1, ...turns.map(totalOf));
  const slot = turns.length === 0 ? 0 : Math.min(maxSlot, width / turns.length);
  const barWidth = Math.max(1, slot - gap);
  const offset = width - slot * turns.length;
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0" onMouseLeave={() => onHover?.(null)}>
      {turns.map((turn, index) => {
        // A turn too small to see still gets one pixel, so every turn shows.
        const barHeight = Math.max(1, (totalOf(turn) / most) * height);
        return (
          <g key={`${turn.at}-${index}`}>
            <rect
              x={offset + index * slot}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={Math.min(1, barWidth / 2)}
              fill="currentColor"
              opacity={active === undefined || active === null || active === index ? 1 : 0.45}
            />
            {onHover === undefined ? null : (
              <rect
                x={offset + index * slot}
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

function when(time: number): string {
  return new Date(time).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Thu, Sep 24, 10:20 AM to 1:27 PM", naming the day once when both fall on it. */
export function spanLabel(first: number, last: number): string {
  const day = (time: number) => new Date(time).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (day(first) === day(last)) return `${day(first)}, ${clock(first)} to ${clock(last)}`;
  return `${day(first)}, ${clock(first)} to ${day(last)}, ${clock(last)}`;
}

function percent(part: number, total: number): string {
  if (total === 0) return "0%";
  const value = (part / total) * 100;
  return value > 0 && value < 1 ? "<1%" : `${Math.round(value)}%`;
}

export function ThreadTokenSummary({ usage, onOpenPage }: { usage: ThreadTokens; onOpenPage?: () => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const recorded = totalOf(usage);
  const largestIndex = usage.recent.reduce(
    (best, turn, index) => (totalOf(turn) > totalOf(usage.recent[best]!) ? index : best),
    0,
  );
  const shownIndex = hovered ?? largestIndex;
  const shown = usage.recent[shownIndex];
  const unrecorded = usage.total - recorded;
  const first = usage.recent[0];
  const last = usage.recent.at(-1);

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
          <p className="text-xs text-muted-foreground">
            {spanLabel(first.at, last.at)}
          </p>
        )}
      </div>

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

      {usage.recent.length === 0 ? null : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">
            Tokens per turn
            {usage.recent.length < usage.turns ? (
              <span className="font-normal text-muted-foreground"> · latest {usage.recent.length}</span>
            ) : null}
          </p>
          <div className="text-foreground/70">
            <Spark turns={usage.recent} width={336} height={56} gap={usage.recent.length > 80 ? 0.5 : 2} maxSlot={24} active={hovered} onHover={setHovered} />
          </div>
          {shown === undefined ? null : (
            <p className="flex text-xs">
              <span className="flex-1 text-muted-foreground">
                {hovered === null ? "Largest turn" : "Turn"} at {when(shown.at)}
              </span>
              <span className="tabular-nums">{formatTokens(totalOf(shown))}</span>
            </p>
          )}
          <p className="flex text-xs">
            <span className="flex-1 text-muted-foreground">Average per turn</span>
            <span className="tabular-nums">{formatTokens(usage.turns === 0 ? 0 : recorded / usage.turns)}</span>
          </p>
        </div>
      )}

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
  onOpenPage,
  isCompactViewport = false,
}: {
  usage: ThreadTokens;
  onOpenPage?: () => void;
  isCompactViewport?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 cursor-pointer gap-1.5 px-2 tabular-nums"
          aria-label={`${formatTokens(usage.total)} tokens used by this thread. Show the summary.`}
        >
          {isCompactViewport ? null : (
            <span className="text-muted-foreground">
              <Spark turns={usage.recent.slice(-SPARK_TURNS)} width={40} height={14} gap={1} maxSlot={4} />
            </span>
          )}
          <span>{formatTokens(usage.total)}</span>
          <span className="text-muted-foreground">tokens</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[368px] p-4">
        <ThreadTokenSummary usage={usage} onOpenPage={onOpenPage} />
      </PopoverContent>
    </Popover>
  );
}

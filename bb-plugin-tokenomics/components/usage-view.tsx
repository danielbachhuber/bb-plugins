// The Tokenomics page: range picker, headline total, chart, and thread list.
// Display only; app.tsx loads the data.
import { useState } from "react";

import { cn } from "@/lib/utils";
import { addTokens, totalOf, ZERO_TOKENS } from "@/usage/breakdown";
import type { ThreadUsage } from "@/usage/contract";
import { formatTokens, RANGES, type Bar, type RangeId } from "@/usage/series";

import { ThreadUsageList } from "./thread-usage-list";
import { PARTS, UsageChart, UsageLegend, type PartKey } from "./usage-chart";

export interface UsageData {
  since: number;
  bars: Bar[];
  unit: "hour" | "day";
  threads: ThreadUsage[];
  recordingSince: number;
}

function RangePicker({ range, onRange }: { range: RangeId; onRange: (range: RangeId) => void }) {
  return (
    <div role="radiogroup" aria-label="Period" className="inline-flex rounded-md border border-border p-0.5">
      {RANGES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === range}
          onClick={() => onRange(option.id)}
          className={cn(
            "rounded px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground",
            option.id === range && "bg-muted font-medium text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function recordingNote(data: UsageData): string | null {
  if (data.recordingSince <= data.since) return null;
  const when = new Date(data.recordingSince).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Tokenomics started recording ${when}. Turns before then count only where bb had not yet pruned them, so earlier bars can read low.`;
}

export function UsageView({
  range,
  onRange,
  data,
  error,
  onOpenThread,
}: {
  range: RangeId;
  onRange: (range: RangeId) => void;
  data: UsageData | null;
  error: string | null;
  onOpenThread: (threadId: string) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<PartKey>>(new Set());
  const toggle = (key: PartKey) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const sum = data === null ? ZERO_TOKENS : data.bars.reduce(addTokens, ZERO_TOKENS);
  const note = data === null ? null : recordingNote(data);

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-4xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {data === null ? "…" : formatTokens(totalOf(sum))}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">tokens</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {PARTS.map((part) => `${formatTokens(sum[part.key])} ${part.label.toLowerCase()}`).join(" · ")}
            </p>
          </div>
          <RangePicker range={range} onRange={onRange} />
        </div>

        {error === null ? null : (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 rounded-lg border border-border bg-card px-3 pb-2 pt-3">
          {data === null ? (
            <div className="h-[230px]" role="status" aria-label="Loading usage" />
          ) : (
            <UsageChart bars={data.bars} unit={data.unit} hidden={hidden} />
          )}
          <div className="mt-1 pl-[44px]">
            <UsageLegend hidden={hidden} onToggle={toggle} />
          </div>
        </div>
        {note === null ? null : <p className="mt-2 text-xs text-muted-foreground">{note}</p>}

        <h2 className="mb-2 mt-6 text-sm font-medium">
          Threads{data === null ? null : <span className="ml-1.5 font-normal text-muted-foreground">{data.threads.length}</span>}
        </h2>
        {data === null ? null : <ThreadUsageList threads={data.threads} onOpen={onOpenThread} />}
      </div>
    </div>
  );
}

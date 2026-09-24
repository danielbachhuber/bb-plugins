// The Tokenomics page: range picker, headline total, chart, and thread list.
// Display only; app.tsx loads the data.
import { useState } from "react";

import { addTokens, totalOf, ZERO_TOKENS } from "@/usage/breakdown";
import type { ThreadUsage } from "@/usage/contract";
import { formatTokens, RANGES, type Bar, type RangeId } from "@/usage/series";

import { Segmented } from "./segmented";
import { LIFECYCLES, ThreadUsageList, threadsIn, type Lifecycle } from "./thread-usage-list";
import { PARTS, UsageChart, UsageLegend, type PartKey } from "./usage-chart";

export interface UsageData {
  since: number;
  bars: Bar[];
  unit: "hour" | "day";
  threads: ThreadUsage[];
  recordingSince: number;
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
  initialHovered,
  initialLifecycle = "active",
}: {
  range: RangeId;
  onRange: (range: RangeId) => void;
  data: UsageData | null;
  error: string | null;
  onOpenThread: (threadId: string) => void;
  /** A bar to show hovered on first render, for stories. */
  initialHovered?: number;
  initialLifecycle?: Lifecycle;
}) {
  const [lifecycle, setLifecycle] = useState<Lifecycle>(initialLifecycle);
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
          <Segmented label="Period" options={RANGES} value={range} onChange={onRange} />
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
            <UsageChart bars={data.bars} unit={data.unit} hidden={hidden} initialHovered={initialHovered} />
          )}
          <div className="mt-1 pl-[44px]">
            <UsageLegend hidden={hidden} onToggle={toggle} />
          </div>
        </div>
        {note === null ? null : <p className="mt-2 text-xs text-muted-foreground">{note}</p>}

        <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Threads</h2>
          {data === null ? null : (
            <Segmented
              label="Threads to list"
              options={LIFECYCLES.map((option) => ({ ...option, count: threadsIn(data.threads, option.id).length }))}
              value={lifecycle}
              onChange={setLifecycle}
            />
          )}
        </div>
        {data === null ? null : (
          <ThreadUsageList
            threads={threadsIn(data.threads, lifecycle)}
            bars={data.bars}
            lifecycle={lifecycle}
            onOpen={onOpenThread}
          />
        )}
      </div>
    </div>
  );
}

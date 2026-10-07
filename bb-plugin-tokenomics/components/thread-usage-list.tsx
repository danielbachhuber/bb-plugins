// The threads that used tokens in the window, most first, each with a
// sparkline of when it used them. Display only.
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { totalOf } from "@/usage/breakdown";
import { contextLevel, type ContextLevel, type ContextThresholds } from "@/usage/context";
import type { ThreadUsage } from "@/usage/contract";
import { formatTokens, type Bar } from "@/usage/series";

export type Lifecycle = "active" | "recent" | "older";

export const LIFECYCLES: ReadonlyArray<{ id: Lifecycle; label: string }> = [
  { id: "active", label: "Active" },
  { id: "recent", label: "Recent" },
  { id: "older", label: "Older" },
];

/** How long an archived thread still counts as recently active. */
export const RECENT_MS = 3 * 24 * 3_600_000;

function lifecycleOf(thread: ThreadUsage, now: number): Lifecycle {
  if (thread.archivedAt === null) return "active";
  return now - thread.archivedAt <= RECENT_MS ? "recent" : "older";
}

/**
 * The threads a lifecycle choice lists: active ones, those archived in the
 * past three days, or those archived before that. Deleted threads count as
 * archived.
 */
export function threadsIn(threads: readonly ThreadUsage[], lifecycle: Lifecycle, now: number): ThreadUsage[] {
  return threads.filter((thread) => lifecycleOf(thread, now) === lifecycle);
}

const PROVIDER_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  pi: "Pi",
};

function providerName(providerId: string): string {
  return PROVIDER_NAMES[providerId] ?? providerId;
}

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 20;

/** The thread's tokens in each of the page chart's bars. */
export function threadBars(thread: ThreadUsage, bars: readonly Bar[]): number[] {
  const totals = bars.map(() => 0);
  for (const { hour, total } of thread.hours) {
    const index = bars.findIndex((bar) => hour >= bar.start && hour < bar.end);
    if (index !== -1) totals[index]! += total;
  }
  return totals;
}

/**
 * When the thread used its tokens, on the same bars as the page's chart and
 * scaled to its own busiest one, so a thread still running when you expected
 * it to stop shows bars at the right end. The total beside it gives the size.
 */
function RowSpark({ totals }: { totals: readonly number[] }) {
  const most = Math.max(1, ...totals);
  const slot = totals.length === 0 ? 0 : SPARK_WIDTH / totals.length;
  const barWidth = Math.max(1, slot - (slot > 4 ? 1 : 0.5));
  return (
    <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} aria-hidden className="shrink-0">
      <line x1={0} x2={SPARK_WIDTH} y1={SPARK_HEIGHT - 0.5} y2={SPARK_HEIGHT - 0.5} stroke="currentColor" opacity={0.2} />
      {totals.map((total, index) => {
        if (total === 0) return null;
        const height = Math.max(1, (total / most) * SPARK_HEIGHT);
        return (
          <rect
            key={index}
            x={index * slot}
            y={SPARK_HEIGHT - height}
            width={barWidth}
            height={height}
            rx={Math.min(1, barWidth / 2)}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

const EMPTY: Record<Lifecycle, string> = {
  active: "No active thread used tokens in this period.",
  recent: "No thread archived in the past three days used tokens in this period.",
  older: "No thread archived more than three days ago used tokens in this period.",
};

/** How an active thread's latest context rates against the settings; archived threads are not rated. */
export function threadContextLevel(thread: ThreadUsage, thresholds: ContextThresholds): ContextLevel | null {
  if (thread.archivedAt !== null || thread.context === null) return null;
  return contextLevel(thread.context, thresholds);
}

const NO_THRESHOLDS: ContextThresholds = { warning: null, error: null };

export function ThreadUsageList({
  threads,
  bars,
  lifecycle = "active",
  contextThresholds = NO_THRESHOLDS,
  onOpen,
}: {
  /** Already narrowed to the lifecycle; the lifecycle only picks the empty message. */
  threads: readonly ThreadUsage[];
  /** The page chart's bars, which the sparklines line up with. */
  bars: readonly Bar[];
  lifecycle?: Lifecycle;
  /** The context settings; rows past them are tinted as Now tints what is due today, then what is overdue. */
  contextThresholds?: ContextThresholds;
  onOpen: (threadId: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <div
        role="status"
        className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
      >
        {EMPTY[lifecycle]}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {threads.map((thread) => {
        const total = totalOf(thread);
        const archived = thread.archivedAt !== null;
        const level = threadContextLevel(thread, contextThresholds);
        const meta = [
          thread.projectName,
          providerName(thread.providerId),
          `${thread.turns} ${thread.turns === 1 ? "turn" : "turns"}`,
          thread.context === null ? null : `${formatTokens(thread.context)} context`,
        ].filter((part) => part !== null && part !== "");
        return (
          <li
            key={thread.threadId}
            className={cn(
              archived && "bg-muted/30",
              // Now's due-today and overdue treatments: a bar where the padding was.
              level === "warning" &&
                "border-l-2 border-l-[#eda100] bg-[#eda100]/[0.06] dark:border-l-[#c98500] dark:bg-[#c98500]/[0.08]",
              level === "error" && "border-l-2 border-l-destructive bg-destructive/[0.04]",
            )}
            title={level === null ? undefined : `Its context is ${formatTokens(thread.context!)} tokens, which every model call re-reads`}
          >
            <button
              type="button"
              onClick={() => onOpen(thread.threadId)}
              className={cn(
                "flex w-full items-center gap-4 py-2.5 pr-4 text-left text-sm hover:bg-muted/50",
                level === null ? "pl-4" : "pl-[14px]",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate",
                      (thread.title === null || archived) && "text-muted-foreground",
                    )}
                  >
                    {thread.title ?? "Untitled thread"}
                  </span>
                  {archived ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-px text-[11px] text-muted-foreground">
                      <Icon name="Archive" className="size-3" />
                      Archived
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{meta.join(" · ")}</span>
              </span>
              <span className={cn("hidden sm:block", archived ? "text-muted-foreground/60" : "text-foreground/60")}>
                <RowSpark totals={threadBars(thread, bars)} />
              </span>
              <span
                className={cn("w-16 shrink-0 text-right tabular-nums", archived && "text-muted-foreground")}
                title={`${total.toLocaleString()} tokens`}
              >
                {formatTokens(total)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

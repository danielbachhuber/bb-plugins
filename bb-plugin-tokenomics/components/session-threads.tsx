// The session's top threads in the title bar's popover, below the chart: each
// with its goal's progress, what the goal has spent against the top of its
// token estimate, and its tokens this session. Display only; app.tsx loads them.
import { cn } from "@/lib/utils";
import type { SessionThread } from "@/usage/contract";
import { verdict } from "@/usage/forecast";
import { formatTokens } from "@/usage/series";

import { verdictTone } from "./forecast-range";
import { GoalDonut } from "./goal-line";

function GoalMark({ goal }: { goal: SessionThread["goal"] }) {
  if (goal === null) return <span className="size-3.5 shrink-0" />;
  const over = goal.outcome === null && goal.estimate !== null && goal.spentTokens > goal.estimate[1];
  return (
    <span className="flex shrink-0">
      <GoalDonut
        stages={goal.states.length}
        reached={goal.states.filter((state) => state === "done").length}
        states={goal.states}
        counts={goal.counts}
        outcome={goal.outcome}
        size={14}
        tone={over ? "over" : "default"}
      />
    </span>
  );
}

function GoalSpent({ goal }: { goal: SessionThread["goal"] }) {
  if (goal === null) return <span className="w-24 shrink-0 text-right text-muted-foreground/60">no goal</span>;
  if (goal.estimate === null) {
    return <span className="w-24 shrink-0 text-right tabular-nums">{formatTokens(goal.spentTokens)}</span>;
  }
  const tone = verdictTone(verdict(goal.spentTokens, goal.estimate));
  return (
    <span className="w-24 shrink-0 text-right tabular-nums">
      <span className={tone.className} style={tone.style}>
        {formatTokens(goal.spentTokens)}
      </span>
      <span className="text-muted-foreground/60"> / {formatTokens(goal.estimate[1])}</span>
    </span>
  );
}

export function SessionThreads({
  threads,
  more,
  onOpenThread,
  onOpenAll,
}: {
  threads: readonly SessionThread[];
  more: { count: number; tokens: number };
  onOpenThread: (threadId: string) => void;
  onOpenAll: () => void;
}) {
  if (threads.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-1 flex items-center gap-2 px-1 text-xs font-medium">
        <span className="flex-1">This session's threads</span>
        <span className="w-24 shrink-0 text-right font-normal text-muted-foreground">Goal spent</span>
        <span className="w-12 shrink-0 text-right font-normal text-muted-foreground">Session</span>
      </div>
      {threads.map((thread) => (
        <button
          key={thread.threadId}
          type="button"
          onClick={() => onOpenThread(thread.threadId)}
          className="flex w-full items-center gap-2 rounded px-1 py-[3px] text-left text-xs hover:bg-accent"
        >
          <GoalMark goal={thread.goal} />
          <span className={cn("min-w-0 flex-1 truncate", thread.archivedAt !== null && "text-muted-foreground")}>
            {thread.title ?? "Untitled thread"}
          </span>
          <GoalSpent goal={thread.goal} />
          <span className="w-12 shrink-0 text-right tabular-nums">{formatTokens(thread.tokens)}</span>
        </button>
      ))}
      {more.count === 0 ? null : (
        <button type="button" onClick={onOpenAll} className="mt-1 px-1 text-left text-xs text-muted-foreground hover:text-foreground">
          {more.count} more {more.count === 1 ? "thread" : "threads"} · {formatTokens(more.tokens)} · Open Tokenomics for all
        </button>
      )}
    </div>
  );
}

// The threads that used tokens in the window, most first. Display only.
import { cn } from "@/lib/utils";
import { totalOf } from "@/usage/breakdown";
import type { ThreadUsage } from "@/usage/contract";
import { formatTokens } from "@/usage/series";

import { PARTS } from "./usage-chart";

const PROVIDER_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  pi: "Pi",
};

function providerName(providerId: string): string {
  return PROVIDER_NAMES[providerId] ?? providerId;
}

export function ThreadUsageList({
  threads,
  onOpen,
}: {
  threads: readonly ThreadUsage[];
  onOpen: (threadId: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <div
        role="status"
        className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
      >
        No thread used tokens in this period.
      </div>
    );
  }

  const most = Math.max(...threads.map(totalOf));
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {threads.map((thread) => {
        const total = totalOf(thread);
        const meta = [
          thread.projectName,
          providerName(thread.providerId),
          `${thread.turns} ${thread.turns === 1 ? "turn" : "turns"}`,
        ].filter((part) => part !== null && part !== "");
        return (
          <li key={thread.threadId}>
            <button
              type="button"
              onClick={() => onOpen(thread.threadId)}
              className="flex w-full items-center gap-4 px-4 py-2.5 text-left text-sm hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate", thread.title === null && "text-muted-foreground")}>
                  {thread.title ?? "Untitled thread"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{meta.join(" · ")}</span>
              </span>
              <span className="hidden w-32 shrink-0 sm:block" aria-hidden>
                <span className="flex h-1.5 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(2, (total / most) * 100)}%` }}>
                  {PARTS.map((part) => (
                    <span key={part.key} className={part.swatch} style={{ width: `${total === 0 ? 0 : (thread[part.key] / total) * 100}%` }} />
                  ))}
                </span>
              </span>
              <span
                className="w-16 shrink-0 text-right tabular-nums"
                title={PARTS.map((part) => `${part.label}: ${thread[part.key].toLocaleString()}`).join("\n")}
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

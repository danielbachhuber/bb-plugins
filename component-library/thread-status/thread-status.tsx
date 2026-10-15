// A row whose item already has a thread: an orange edge down the row's left
// side, Open thread where the row's Start thread action was, and a line under
// the actions, set off by an orange rule, with what the thread is doing right
// now and its title. The status is the one bb's sidebar shows, read live.
import { useCallback, useMemo } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  BubbleChatIcon,
  CancelCircleIcon,
  HelpCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { experimental_useSidebarThreads as useSidebarThreads } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import { cn } from "../lib/cn";

/** What the thread is doing, folded from bb's sidebar indicator into the five a row says. */
export type ThreadLive = "working" | "needs-you" | "done" | "failed" | "idle";

export interface ThreadStatus {
  id: string;
  /** The thread's title, or bb's fallback while it is still unnamed. */
  title: string;
  live: ThreadLive;
}

const LIVE_LABEL: Record<ThreadLive, string> = {
  working: "Working",
  "needs-you": "Needs you",
  done: "Done, unread",
  failed: "Failed, unread",
  idle: "Idle",
};

/**
 * The row edge for an item with a thread, in the sweeps' orange. Out to the
 * list's edges, with the bar where the list's padding was, the same way a
 * stale or overdue row is drawn.
 */
export const THREAD_EDGE =
  "-mx-4 border-l-2 border-l-[#ea7a0c] bg-[#ea7a0c]/[0.05] pl-[14px] pr-4 dark:border-l-[#f08a24] dark:bg-[#f08a24]/[0.06]";

/** The same edge for a list drawn inside its own border, which has no padding to reach into. */
export const THREAD_EDGE_INSET =
  "border-l-2 border-l-[#ea7a0c] bg-[#ea7a0c]/[0.05] dark:border-l-[#f08a24] dark:bg-[#f08a24]/[0.06]";

/** On a button: hovering it underlines its label. */
const UNDERLINE_ON_HOVER = "[&:hover_[data-thread-underline]]:underline [&:hover_[data-thread-underline]]:underline-offset-2";

const ACCENT = "text-[#c25e00] dark:text-[#f5a25a]";
const RULE = "border-l-[#ea7a0c]/45 dark:border-l-[#f08a24]/50";

/** bb's sidebar indicator, as the state a row shows. */
export function liveOf(thread: Pick<PluginSidebarThread, "indicator" | "hasPendingInteraction">): ThreadLive {
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return "needs-you";
  switch (thread.indicator) {
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "goal":
    case "working-draft":
      return "working";
    case "unread-success":
      return "done";
    case "unread-error":
      return "failed";
    default:
      return "idle";
  }
}

export function statusOf(thread: PluginSidebarThread): ThreadStatus {
  return { id: thread.id, title: thread.title ?? thread.titleFallback ?? "Untitled thread", live: liveOf(thread) };
}

/**
 * Looks up the live status of a thread by id from bb's sidebar, which the
 * page already holds: no request per row. Null for an id the sidebar does not
 * list, such as an archived thread, or while it loads.
 */
export function useThreadStatus(): (threadId: string | null | undefined) => ThreadStatus | null {
  const { threads } = useSidebarThreads();
  const byId = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
  return useCallback(
    (threadId) => {
      if (!threadId) return null;
      const thread = byId.get(threadId);
      return thread ? statusOf(thread) : null;
    },
    [byId],
  );
}

function Glyph({ live }: { live: ThreadLive }) {
  const icons: Record<Exclude<ThreadLive, "done">, IconSvgElement> = {
    working: Loading03Icon,
    "needs-you": HelpCircleIcon,
    failed: CancelCircleIcon,
    idle: BubbleChatIcon,
  };
  if (live === "done") return <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-current" />;
  return (
    <HugeiconsIcon
      icon={icons[live]}
      aria-hidden="true"
      className={cn("size-3 shrink-0", live === "working" && "animate-spin")}
    />
  );
}

/**
 * Open thread, drawn like the other actions in a row's action line. Put it
 * first, where Start thread was.
 */
export function OpenThreadAction({ onOpen, disabled = false }: { onOpen: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground disabled:opacity-60",
        UNDERLINE_ON_HOVER,
      )}
    >
      <HugeiconsIcon icon={BubbleChatIcon} aria-hidden="true" className="size-3" />
      <span data-thread-underline="">Open thread</span>
    </button>
  );
}

/**
 * The thread under the row's actions, set off by an orange rule like a quote:
 * what the thread is doing, then its title. The whole line opens the thread.
 * With no status, while bb's sidebar loads or for a thread it does not list,
 * it still opens the thread.
 */
export function ThreadLine({
  status,
  onOpen,
  className,
}: {
  status: ThreadStatus | null;
  onOpen: () => void;
  className?: string;
}) {
  const live = status?.live ?? "idle";
  const loud = live === "needs-you" || live === "failed";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "mt-1.5 flex w-full min-w-0 items-center border-l-2 pl-2 text-left text-xs text-muted-foreground hover:text-foreground",
        RULE,
        UNDERLINE_ON_HOVER,
        className,
      )}
    >
      <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap", loud && cn("font-medium", ACCENT))}>
        <span className={cn("inline-flex size-3 items-center justify-center", ACCENT)}>
          <Glyph live={live} />
        </span>
        {status === null ? <span data-thread-underline="">Thread</span> : LIVE_LABEL[live]}
      </span>
      {status === null ? null : (
        <>
          <span aria-hidden="true" className="mx-1.5 shrink-0 text-muted-foreground/60">
            ·
          </span>
          <span data-thread-underline="" className="min-w-0 truncate">
            {status.title}
          </span>
        </>
      )}
      <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="ml-1 size-3 shrink-0" />
    </button>
  );
}

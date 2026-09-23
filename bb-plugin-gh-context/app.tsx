import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  useComposerView,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { HarvestRowClock } from "bb-plugin-harvest/clock";
import type { HarvestTimerClient } from "bb-plugin-harvest/picker";
import { timerDefaultsForItem, type GitHubItem } from "bb-plugin-harvest/github";
import { ContextBanner } from "./components/context-banner";
import type { MergeMethod, RunningReference, ThreadContext, rpcContract } from "./context/contract";
import { harvestItem } from "./context/harvest-item";
import * as hideDefaultBanner from "./context/hide";

/** Must match `REALTIME_CHANNEL` in server.ts, which the app cannot import. */
const REALTIME_CHANNEL = "context-changed";

/** Below this width the banner drops its labels, as bb's does. */
const COMPACT_WIDTH_PX = 480;

/** A backstop for changes nothing announces, such as a push from a terminal. */
const POLL_INTERVAL_MS = 60_000;

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;

/** Harvest's picker, speaking to Harvest through this plugin's server. */
function useHarvestClient(rpc: Rpc): HarvestTimerClient {
  return useMemo(
    () => ({
      assignments: () => rpc.call("harvestAssignments", null),
      trackedHours: (input) =>
        rpc.call("harvestTrackedHours", {
          externalId: input.externalId,
          groupId: input.groupId ?? null,
        }),
      startTimer: (input) => rpc.call("harvestStartTimer", input),
      lastSelection: (input) => rpc.call("harvestLastSelection", input),
      stopTimer: async (input) => {
        await rpc.call("harvestStopTimer", input);
      },
    }),
    [rpc],
  );
}

function isRunningFor(running: RunningReference, item: GitHubItem): boolean {
  if (running === null || running.externalId !== String(item.number)) return false;
  const { groupId } = timerDefaultsForItem(item).externalReference;
  return running.groupId === null || running.groupId === groupId;
}

/** Whether the prompt box around the banner is narrow, from a probe inside it. */
function useCompactWidth(): [(element: HTMLSpanElement | null) => void, boolean] {
  const [compact, setCompact] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: HTMLSpanElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    const shell = element?.closest("[data-promptbox-shell]");
    if (!shell || typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(([entry]) => {
      if (entry) setCompact(entry.contentRect.width < COMPACT_WIDTH_PX);
    });
    observer.current.observe(shell);
  }, []);
  return [ref, compact];
}

/**
 * Each thread's last context, for as long as the app is open. Coming back to
 * a thread shows what it had straight away, refreshed behind it, instead of
 * the skeleton again.
 */
const lastContext = new Map<string, ThreadContext>();

function Banner() {
  const view = useComposerView();
  const threadId = view.scope.kind === "thread" ? view.scope.threadId : null;
  const rpc = useRpc<typeof rpcContract>();
  const harvestClient = useHarvestClient(rpc);
  const [context, setContext] = useState<ThreadContext | null>(() =>
    threadId ? (lastContext.get(threadId) ?? null) : null,
  );
  const [pending, setPending] = useState(false);
  const [measureRef, compact] = useCompactWidth();

  // The thread this banner is showing now. A response that comes back after
  // the banner has moved to another thread is dropped, or the merge button
  // would act on one thread while showing another's pull request.
  const currentThreadId = useRef(threadId);
  currentThreadId.current = threadId;

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const next = await rpc.call("threadContext", { threadId });
      lastContext.set(threadId, next);
      if (currentThreadId.current === threadId) setContext(next);
    } catch {
      // Keep what is on screen; the next signal or poll tries again.
    }
  }, [rpc, threadId]);

  // bb's own lookup of the thread's pull request is live, and it changes when
  // a PR opens, its checks move, or it merges, none of which bb announces to
  // plugin servers. Its identity is the cue to ask for the full picture again.
  const { pullRequest: hostPullRequest } = useSidebarThreadPullRequest(threadId ?? "");
  const hostPullRequestKey = hostPullRequest
    ? `${hostPullRequest.number}:${hostPullRequest.state}:${hostPullRequest.attention}`
    : "none";
  const isRunning = view.run.isRunning;

  useEffect(() => {
    void load();
  }, [load, hostPullRequestKey, isRunning]);

  useEffect(() => {
    setContext(threadId ? (lastContext.get(threadId) ?? null) : null);
  }, [threadId]);

  useEffect(() => {
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useRealtime(REALTIME_CHANNEL, (payload) => {
    const signalled = (payload as { threadId?: string | null } | null)?.threadId ?? null;
    if (signalled === null || signalled === threadId) void load();
  });

  const act = useCallback(
    async (label: string, run: () => Promise<unknown>) => {
      setPending(true);
      try {
        await run();
      } catch (error) {
        toast.error(`${label} failed`, { description: error instanceof Error ? error.message : String(error) });
      } finally {
        setPending(false);
        void load();
      }
    },
    [load],
  );

  if (!threadId) return null;

  const item = context?.harvest.available ? harvestItem(context) : null;
  const harvestSlot =
    context && item ? (
      <HarvestRowClock
        row={item}
        running={isRunningFor(context.harvest.running, item) ? context.harvest.running : null}
        client={harvestClient}
        surface="gh-context"
        onChanged={() => void load()}
      />
    ) : undefined;

  return (
    <ContextBanner
      context={context}
      compact={compact}
      harvestSlot={harvestSlot}
      pending={pending}
      measureRef={measureRef}
      onMerge={(method: MergeMethod) =>
        void act("Merge", () => rpc.call("mergePullRequest", { threadId, method }))
      }
      onMarkReady={() => void act("Mark ready", () => rpc.call("markPullRequestReady", { threadId }))}
      onUnarchive={() => void act("Unarchive", () => rpc.call("unarchiveThread", { threadId }))}
    />
  );
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "context",
    scopes: ["thread"],
    // Bare: the banner draws bb's card itself, so a thread with nothing to
    // show draws nothing, while still carrying the marker that hides bb's.
    banners: [{ id: "context", chrome: "bare", component: Banner }],
  });

  app.contentScripts.register({
    id: hideDefaultBanner.id,
    mount({ signal }) {
      return hideDefaultBanner.mount(signal);
    },
  });
});

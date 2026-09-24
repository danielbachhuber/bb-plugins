import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  definePluginApp,
  useRealtime,
  useRpc,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { HeaderFallback } from "./components/header-fallback";
import { OverviewBand, type OverviewHandlers } from "./components/overview-band";
import { findHeader, insertBandContainer } from "./overview/attach";
import { REALTIME_CHANNEL } from "./overview/contract";
import { nextStatus, opensExpanded } from "./overview/steps";
import type { Overview } from "./overview/types";
import type { rpcContract } from "./server";

/** The realtime payload the server publishes on every change. */
type Signal = { threadId?: unknown };

/**
 * One thread's overview, kept fresh by the realtime channel. Every signal
 * triggers a re-read rather than carrying rows, so a band that missed a
 * message recovers on the next one.
 */
function useOverview(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [overview, setOverview] = useState<Overview | null>(null);

  const reload = useCallback(async () => {
    try {
      setOverview((await rpc.call("overview_get", { threadId })).overview);
    } catch (error) {
      // A failed read keeps the last good overview on screen.
      console.error("thread-overview: read failed", error);
    }
  }, [rpc, threadId]);

  useEffect(() => {
    setOverview(null);
    void reload();
  }, [reload]);

  useRealtime(
    REALTIME_CHANNEL,
    useCallback(
      (payload: unknown) => {
        if ((payload as Signal)?.threadId === threadId) void reload();
      },
      [reload, threadId],
    ),
  );

  const run = useCallback(
    async (work: () => Promise<{ overview: Overview }>, failure: string) => {
      try {
        setOverview((await work()).overview);
      } catch (error) {
        toast.error(failure, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [],
  );

  const handlers: OverviewHandlers = {
    onCycle: (step) =>
      void run(
        () =>
          rpc.call("overview_set_status", {
            threadId,
            refs: [step.id],
            status: nextStatus(step.status),
            source: "user",
          }),
        "Could not change that step",
      ),
    onSaveSummary: (summary) =>
      void run(
        () => rpc.call("overview_set_summary", { threadId, summary, source: "user" }),
        "Could not save the summary",
      ),
    onAdd: (text) =>
      void run(
        () => rpc.call("overview_add", { threadId, texts: [text], source: "user" }),
        "Could not add that step",
      ),
    onRemove: (step) =>
      void run(() => rpc.call("overview_remove", { threadId, id: step.id }), "Could not remove that step"),
  };

  const setView = useCallback(
    (view: { collapsed?: boolean; seen?: boolean }) =>
      rpc.call("overview_set_view", { threadId, ...view }).catch((error: unknown) => {
        console.error("thread-overview: saving the band's view failed", error);
      }),
    [rpc, threadId],
  );

  return { overview, handlers, setView };
}

/** The current time, to the minute, for "updated 12 min ago". */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function Band({ threadId }: { threadId: string }) {
  const { overview, handlers, setView } = useOverview(threadId);
  const now = useNow();
  // Decided once per visit, from the first read: your last choice, unless the
  // agent changed something since you last looked.
  const [expanded, setExpanded] = useState<boolean | null>(null);

  useEffect(() => {
    if (overview !== null && expanded === null) setExpanded(opensExpanded(overview));
  }, [overview, expanded]);

  // Looking at the expanded band counts as seeing it, including a change the
  // agent makes while you watch.
  const agentUpdatedAt = overview?.agentUpdatedAt;
  useEffect(() => {
    if (expanded) void setView({ seen: true });
  }, [expanded, agentUpdatedAt, setView]);

  if (overview === null || expanded === null) return null;
  return (
    <OverviewBand
      overview={overview}
      now={now}
      expanded={expanded}
      onToggle={() => {
        setExpanded(!expanded);
        void setView({ collapsed: expanded });
      }}
      {...handlers}
    />
  );
}

function Fallback({ threadId, isCompactViewport }: { threadId: string; isCompactViewport: boolean }) {
  const { overview, handlers } = useOverview(threadId);
  const now = useNow();
  if (overview === null) return null;
  return (
    <HeaderFallback
      overview={overview}
      now={now}
      isCompactViewport={isCompactViewport}
      {...handlers}
    />
  );
}

/**
 * bb draws this inside one thread's header. It finds that header and puts the
 * band directly below it, or, when it cannot, draws the fallback where it is.
 */
function ThreadOverviewAction({ threadId, isCompactViewport }: PluginThreadHeaderActionProps) {
  const probe = useRef<HTMLSpanElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [attached, setAttached] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const header = findHeader(probe.current);
    if (!header) {
      console.info(
        "thread-overview: no <header> around the header action, so the band " +
          "cannot attach below it. Showing the overview in the header instead.",
      );
      setAttached(false);
      return;
    }
    const { container: inserted, remove } = insertBandContainer(header);
    setContainer(inserted);
    setAttached(true);
    return () => {
      remove();
      setContainer(null);
    };
  }, []);

  return (
    <>
      <span ref={probe} hidden aria-hidden="true" />
      {container !== null ? createPortal(<Band threadId={threadId} />, container) : null}
      {attached === false ? (
        <Fallback threadId={threadId} isCompactViewport={isCompactViewport} />
      ) : null}
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "thread-overview",
    title: "Thread overview",
    component: ThreadOverviewAction,
  });
});

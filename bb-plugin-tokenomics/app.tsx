// bb-plugin-tokenomics — the Tokenomics page, the thread header's token count,
// and the context meter above a thread's composer.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useComposerView,
  useRealtime,
  useRpc,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";

import { ContextMeter, overThreshold } from "@/components/context-meter";
import { ThreadTokenCount, type ThreadTokens } from "@/components/thread-token-count";
import { UsageView, type UsageData } from "@/components/usage-view";

import type { rpcContract } from "./server";
import { CONTEXT_CHANNEL, USAGE_CHANNEL, type TurnDetail } from "./usage/contract.js";
import { fillBars, windowFor, type RangeId } from "./usage/series.js";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The window's usage, re-read whenever the server records more. */
function useUsage(range: RangeId) {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const span = windowFor(range, new Date());
    rpc.call("usage_window", { since: span.since }).then(
      (result) => {
        setData({
          since: span.since,
          bars: fillBars(span.bars, result.hours),
          unit: span.unit,
          threads: result.threads,
          recordingSince: result.recordingSince,
        });
        setError(null);
      },
      (cause) => setError(messageOf(cause)),
    );
  }, [rpc, range]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  // The newest bar keeps filling while a thread runs, and the window slides
  // forward every hour, so re-read on new usage and once a minute.
  useRealtime(USAGE_CHANNEL, load);
  useEffect(() => {
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return { data, error };
}

function TokenomicsPage() {
  const [range, setRange] = useState<RangeId>("day");
  const { data, error } = useUsage(range);
  const navigate = useBbNavigate();
  return (
    <UsageView
      range={range}
      onRange={setRange}
      data={data}
      error={error}
      onOpenThread={(threadId) => navigate.toThread(threadId)}
    />
  );
}

function isForThread(payload: unknown, threadId: string): boolean {
  const ids = (payload as { threadIds?: unknown } | null)?.threadIds;
  return Array.isArray(ids) && ids.includes(threadId);
}

function ThreadTokensAction({ threadId, isCompactViewport }: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [usage, setUsage] = useState<ThreadTokens | null>(null);
  // Loaded when the summary first opens, because it reads bb's turn events.
  const [turns, setTurns] = useState<TurnDetail[] | null>(null);
  const [wantsTurns, setWantsTurns] = useState(false);

  const load = useCallback(() => {
    rpc.call("thread_usage", { threadId }).then(setUsage, () => undefined);
  }, [rpc, threadId]);
  const loadTurns = useCallback(() => {
    rpc.call("thread_turns", { threadId }).then(({ turns: loaded }) => setTurns(loaded), () => undefined);
  }, [rpc, threadId]);

  useEffect(() => {
    setUsage(null);
    setTurns(null);
    setWantsTurns(false);
    load();
  }, [load]);
  useEffect(() => {
    if (wantsTurns) loadTurns();
  }, [wantsTurns, loadTurns]);
  const onChange = useMemo(
    () => (payload: unknown) => {
      if (!isForThread(payload, threadId)) return;
      load();
      if (wantsTurns) loadTurns();
    },
    [load, loadTurns, threadId, wantsTurns],
  );
  useRealtime(USAGE_CHANNEL, onChange);

  if (usage === null || usage.total === 0) return null;
  return (
    <ThreadTokenCount
      usage={usage}
      turns={turns}
      onOpen={() => setWantsTurns(true)}
      isCompactViewport={isCompactViewport}
      onOpenPage={() => navigate.toPluginPanel("tokenomics")}
    />
  );
}

interface ContextState {
  context: { usedTokens: number; contextWindow: number | null; at: number } | null;
  lastTurn: number | null;
  threshold: number | null;
  archived: boolean;
}

/** The meter above the composer, drawn only once the thread's context passes the setting. */
function ContextMeterBanner() {
  const view = useComposerView();
  const threadId = view.scope.kind === "thread" ? view.scope.threadId : null;
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<ContextState | null>(null);
  // When Compact was pressed; cleared once a newer context size arrives.
  const [requestedAt, setRequestedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(threadId);
  current.current = threadId;

  const load = useCallback(() => {
    if (threadId === null) return;
    rpc.call("thread_context", { threadId }).then(
      (next: ContextState) => {
        if (current.current === threadId) setState(next);
      },
      () => undefined,
    );
  }, [rpc, threadId]);

  useEffect(() => {
    setState(null);
    setRequestedAt(null);
    setError(null);
    load();
  }, [load]);
  const onChange = useMemo(
    () => (payload: unknown) => {
      if (threadId !== null && isForThread(payload, threadId)) load();
    },
    [load, threadId],
  );
  useRealtime(CONTEXT_CHANNEL, onChange);
  useRealtime(USAGE_CHANNEL, onChange);

  useEffect(() => {
    if (requestedAt !== null && state?.context != null && state.context.at > requestedAt) setRequestedAt(null);
  }, [requestedAt, state]);

  if (threadId === null || state === null || state.archived) return null;
  if (state.context === null || state.threshold === null) return null;
  if (!overThreshold(state.context.usedTokens, state.threshold)) return null;

  const onCompact = () => {
    setError(null);
    setRequestedAt(Date.now());
    rpc.call("compact_thread", { threadId }).catch((cause: unknown) => {
      setRequestedAt(null);
      setError(messageOf(cause));
    });
  };

  return (
    <ContextMeter
      usedTokens={state.context.usedTokens}
      contextWindow={state.context.contextWindow}
      threshold={state.threshold}
      lastTurn={state.lastTurn}
      running={view.run.isRunning}
      compacting={requestedAt !== null}
      error={error}
      compact={view.layout === "compact"}
      onCompact={onCompact}
    />
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "tokenomics",
    title: "Tokenomics",
    icon: "ChartColumn",
    path: "tokenomics",
    component: TokenomicsPage,
  });

  app.slots.experimental_threadHeaderAction({
    id: "thread-tokens",
    title: "Tokens used",
    component: ThreadTokensAction,
  });

  app.composer.customize({
    id: "context-meter",
    scopes: ["thread"],
    // Bare: the meter draws its own card, and a thread under the setting
    // draws nothing at all.
    banners: [{ id: "context-meter", chrome: "bare", component: ContextMeterBanner }],
  });
});

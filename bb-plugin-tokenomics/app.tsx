// bb-plugin-tokenomics — the Tokenomics page and the thread header's token count.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRealtime,
  useRpc,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";

import { ThreadTokenCount, type ThreadTokens } from "@/components/thread-token-count";
import { UsageView, type UsageData } from "@/components/usage-view";

import type { rpcContract } from "./server";
import { USAGE_CHANNEL } from "./usage/contract.js";
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

function ThreadTokensAction({ threadId }: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [usage, setUsage] = useState<ThreadTokens | null>(null);

  const load = useCallback(() => {
    rpc.call("thread_usage", { threadId }).then(setUsage, () => undefined);
  }, [rpc, threadId]);
  useEffect(() => {
    setUsage(null);
    load();
  }, [load]);
  const onChange = useMemo(
    () => (payload: unknown) => {
      if (isForThread(payload, threadId)) load();
    },
    [load, threadId],
  );
  useRealtime(USAGE_CHANNEL, onChange);

  if (usage === null || usage.total === 0) return null;
  return <ThreadTokenCount usage={usage} />;
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
});

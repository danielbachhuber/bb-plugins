// bb-plugin-tokenomics — the Tokenomics page, the thread header's token count,
// and the context meter above a thread's composer.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  definePluginApp,
  useBbNavigate,
  useComposerView,
  useRealtime,
  useRpc,
  experimental_useProviders,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";

import { SidebarLevels } from "@danielbachhuber/bb-plugin-component-library/sidebar-count";

import { ContextMeter } from "@/components/context-meter";
import { TurnStrip, TurnSummaryLine } from "@/components/turn-summary";
import { ThreadTokenCount, type ThreadTokens } from "@/components/thread-token-count";
import { TOP_BAR_LIMITS_WIDTH, TopBarLimits, urgentSession } from "@/components/limit-spark";
import { UsageView, type UsageData } from "@/components/usage-view";
import { TopBarSlot, useTopBarRoom } from "@danielbachhuber/bb-plugin-component-library/top-bar";

import type { rpcContract } from "./server";
import { contextLevel, type ContextThresholds } from "./usage/context.js";
import { CONTEXT_CHANNEL, LIMITS_CHANNEL, TURNS_CHANNEL, USAGE_CHANNEL } from "./usage/channels.js";
import type { Limit, TurnDetail, TurnSummary, TurnWork } from "./usage/contract.js";
import { onlyHostChanges, placeTurnHosts, removeTurnHosts } from "./timeline/turn-hosts.js";
import { fillBars, windowFor, type Bar, type RangeId } from "./usage/series.js";

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
          contextThresholds: result.contextThresholds,
          turnTime: result.turnTime,
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

/** The subscriptions' usage limits, re-read after each reading the server stores and each turn's usage. */
function useLimits(): Limit[] {
  const rpc = useRpc<typeof rpcContract>();
  const [limits, setLimits] = useState<Limit[]>([]);
  const load = useCallback(() => {
    rpc.call("usage_limits", null).then((result) => setLimits(result.limits), () => undefined);
  }, [rpc]);
  useEffect(load, [load]);
  useRealtime(LIMITS_CHANNEL, load);
  // The past hour's tokens and the session's spark change with each turn.
  useRealtime(USAGE_CHANNEL, load);
  return limits;
}

/**
 * The past day's tokens per hour for the title bar's popover, read from
 * Tokenomics' own database each time the popover opens.
 */
function usePastDayBars() {
  const rpc = useRpc<typeof rpcContract>();
  const [bars, setBars] = useState<Bar[] | null>(null);
  const load = useCallback(() => {
    const span = windowFor("day", new Date());
    rpc.call("usage_hours", { since: span.since }).then(
      (result) => setBars(fillBars(span.bars, result.hours)),
      () => undefined,
    );
  }, [rpc]);
  return { bars, load };
}

function useProviderName() {
  const providers = experimental_useProviders();
  return (providerId: string) =>
    providers.providers.find((provider) => provider.id === providerId)?.displayName ?? providerId;
}

/**
 * The session in bb's title bar, after the other plugins' buttons: its spark
 * chart, rings for the session's and the week's percent used, the page's
 * meters and the past day's chart on hover, and the page on click. With two
 * subscriptions it shows the one closer to its limit. Draws nothing until a
 * provider reports a session.
 */
function LimitsTopBar() {
  const limits = useLimits();
  const providerName = useProviderName();
  const navigate = useBbNavigate();
  const pastDay = usePastDayBars();
  // The spark's empty slots are the time left, so it redraws as time passes.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const session = urgentSession(limits);
  if (session === null) return null;
  const account = limits.filter(
    (limit) => limit.providerId === session.providerId && limit.accountKey === session.accountKey,
  );
  return (
    <TopBarSlot pluginId="tokenomics" order={4} alignEnd activeOn={["/plugins/tokenomics/tokenomics"]}>
      <FittedLimits
        session={session}
        limits={account}
        now={now}
        providerName={providerName}
        onOpen={() => navigate.toPluginPanel("tokenomics")}
        bars={pastDay.bars}
        onHover={pastDay.load}
      />
    </TopBarSlot>
  );
}

/**
 * The title bar button with its spark chart while the open sidebar has room
 * for it, the rings alone while it is narrower, and nothing while it is
 * closed, so it never reaches past the sidebar's edge into the page title.
 * Outside the desktop title bar there is no edge, so the chart always shows.
 */
function FittedLimits(props: ComponentProps<typeof TopBarLimits>) {
  const room = useTopBarRoom();
  if (room !== null && room < 0) return null;
  return <TopBarLimits {...props} compact={room !== null && room < TOP_BAR_LIMITS_WIDTH} />;
}

function TokenomicsPage() {
  const [range, setRange] = useState<RangeId>("day");
  const { data, error } = useUsage(range);
  const limits = useLimits();
  const providerName = useProviderName();
  const navigate = useBbNavigate();
  return (
    <UsageView
      range={range}
      onRange={setRange}
      data={data}
      error={error}
      onOpenThread={(threadId) => navigate.toThread(threadId)}
      limits={limits}
      providerName={providerName}
    />
  );
}

const plural = (count: number) => `${count} ${count === 1 ? "thread" : "threads"}`;

/**
 * Beside Tokenomics in the sidebar: how many active threads have their
 * context past the warning, in amber, and past the error, in red. Re-read
 * when a context size or an archive is recorded, and once a minute for a
 * changed setting.
 */
function ContextLevelsAccessory() {
  const rpc = useRpc<typeof rpcContract>();
  const [levels, setLevels] = useState<{ warning: number; error: number } | null>(null);
  const load = useCallback(() => {
    rpc.call("context_levels", null).then(setLevels, () => undefined);
  }, [rpc]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);
  useRealtime(CONTEXT_CHANNEL, load);
  useRealtime(USAGE_CHANNEL, load);
  if (levels === null) return null;
  return (
    <SidebarLevels
      warning={levels.warning}
      error={levels.error}
      warningLabel={`${plural(levels.warning)} past the context warning`}
      errorLabel={`${plural(levels.error)} past the context limit`}
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
  thresholds: ContextThresholds;
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
  if (state.context === null) return null;
  const level = contextLevel(state.context.usedTokens, state.thresholds);
  if (level === null) return null;

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
      thresholds={state.thresholds}
      level={level}
      lastTurn={state.lastTurn}
      running={view.run.isRunning}
      compacting={requestedAt !== null}
      error={error}
      compact={view.layout === "compact"}
      onCompact={onCompact}
    />
  );
}

/** The thread's turns, re-read when the server records a turn, a tool, or tokens for it. */
function useTurnSummaries(threadId: string | null): TurnSummary[] | null {
  const rpc = useRpc<typeof rpcContract>();
  const [turns, setTurns] = useState<TurnSummary[] | null>(null);
  const current = useRef(threadId);
  current.current = threadId;
  // A running turn reports each tool's start and end, so changes arrive in
  // bursts; one read per burst is enough.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (threadId === null) return;
    rpc.call("thread_turn_summaries", { threadId }).then(
      (result) => {
        if (current.current === threadId) setTurns(result.turns);
      },
      () => undefined,
    );
  }, [rpc, threadId]);

  useEffect(() => {
    setTurns(null);
    load();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [load]);

  const onChange = useMemo(
    () => (payload: unknown) => {
      if (threadId === null || !isForThread(payload, threadId) || timer.current !== null) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        load();
      }, 500);
    },
    [load, threadId],
  );
  useRealtime(TURNS_CHANNEL, onChange);
  useRealtime(USAGE_CHANNEL, onChange);
  return turns;
}

/**
 * What each turn ran, read when its card opens. A finished turn's is read
 * once; the running turn's again on each opening, since it keeps adding.
 */
function useTurnWork(threadId: string | null) {
  const rpc = useRpc<typeof rpcContract>();
  const [work, setWork] = useState<ReadonlyMap<string, TurnWork>>(() => new Map());
  useEffect(() => setWork(new Map()), [threadId]);
  const load = useCallback(
    (turn: TurnSummary) => {
      if (threadId === null || (turn.endedAt !== null && work.has(turn.turnId))) return;
      rpc.call("thread_turn_work", { threadId, turnId: turn.turnId }).then(
        (result) => setWork((current) => new Map(current).set(turn.turnId, result)),
        () => undefined,
      );
    },
    [rpc, threadId, work],
  );
  return { work, load };
}

/** The current time, every second while `ticking`. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [ticking]);
  return now;
}

/**
 * Renders each finished turn's line under its last row in bb's conversation.
 * See timeline/turn-hosts.ts for why this reads bb's markup.
 */
function useTurnLines(
  threadId: string | null,
  turns: readonly TurnSummary[],
  work: ReadonlyMap<string, TurnWork>,
  loadWork: (turn: TurnSummary) => void,
): ReactNode {
  const [hosts, setHosts] = useState<Map<string, HTMLElement>>(() => new Map());
  const hostsRef = useRef(hosts);
  const finished = useMemo(() => turns.filter((turn) => turn.endedAt !== null), [turns]);
  const wanted = useMemo(() => new Set(finished.map((turn) => turn.turnId)), [finished]);

  useEffect(() => {
    if (threadId === null) return;
    let frame: number | null = null;
    const pass = () => {
      frame = null;
      const next = placeTurnHosts(document, threadId, wanted, hostsRef.current);
      const before = hostsRef.current;
      hostsRef.current = next;
      const same = next.size === before.size && [...next].every(([turnId, host]) => before.get(turnId) === host);
      if (!same) setHosts(next);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(pass);
    };
    const observer = new MutationObserver((records) => {
      if (!onlyHostChanges(records)) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [threadId, wanted]);

  useEffect(
    () => () => {
      if (threadId !== null) removeTurnHosts(document, threadId);
      hostsRef.current = new Map();
    },
    [threadId],
  );

  return finished.map((turn) => {
    const host = hosts.get(turn.turnId);
    return host === undefined ? null : createPortal(
          <TurnSummaryLine turn={turn} work={work.get(turn.turnId) ?? null} onOpen={() => loadWork(turn)} />,
          host,
          turn.turnId,
        );
  });
}

/** The strip above the composer, and the line under each turn in the conversation. */
function TurnSummaryBanner() {
  const view = useComposerView();
  const threadId = view.scope.kind === "thread" ? view.scope.threadId : null;
  const turns = useTurnSummaries(threadId);
  const latest = turns?.at(-1) ?? null;
  const running = view.run.isRunning && latest !== null && latest.endedAt === null;
  const now = useNow(running);
  const { work, load } = useTurnWork(threadId);
  const lines = useTurnLines(threadId, turns ?? [], work, load);
  return (
    <>
      {/* Only while a turn runs: once it ends, the line under the turn says the same. */}
      {latest === null || !running ? null : (
        <TurnStrip
          turn={latest}
          running={running}
          now={now}
          work={work.get(latest.turnId) ?? null}
          onOpen={() => load(latest)}
        />
      )}
      {lines}
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "tokenomics",
    title: "Tokenomics",
    // The plugin's own coin stack, declared under bb.branding.experimental_icons.
    icon: "tokenomics/coins",
    path: "tokenomics",
    component: TokenomicsPage,
    experimental_sidebarAccessory: ContextLevelsAccessory,
  });

  app.slots.experimental_appOverlay({ id: "limits-top-bar", component: LimitsTopBar });

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
    banners: [
      { id: "context-meter", chrome: "bare", component: ContextMeterBanner },
      // Bare as well: the strip draws its own card, and the lines under each
      // turn render into bb's conversation through portals.
      { id: "turn-summary", chrome: "bare", component: TurnSummaryBanner },
    ],
  });
});

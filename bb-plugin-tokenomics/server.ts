// bb-plugin-tokenomics — how many tokens each thread uses, and when.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { CONTEXT_CHANNEL, GOALS_CHANNEL, LIMITS_CHANNEL, MAX_ROWS, MAX_WINDOW_MS, rpcContract, TURNS_CHANNEL, USAGE_CHANNEL } from "./usage/contract.js";
import {
  accountSpans,
  limitViews,
  samplesFromUsage,
  seenSince,
  sizeOf,
  SLOT_MS,
  tokensWithin,
  windowKey,
  type LimitSample,
  type LimitView,
} from "./usage/limits.js";
import {
  formatCommands,
  formatThreads,
  slowestCommands,
  sortReports,
  turnTimeSummary,
  type SortKey,
  type ThreadReport,
} from "./usage/report.js";
import { readTranscripts, subagentsDir } from "./usage/subagent-files.js";
import { TIMING_EVENTS, timeBreakdown, turnSplits } from "./usage/timing.js";
import { CONTEXT_EVENT, contextRowOf, countLevels, parseThreshold, type ContextThresholds } from "./usage/context.js";
import { createStore, MIGRATIONS } from "./usage/store.js";
import { createGoalStore } from "./usage/goal-store.js";
import { accountStretches, formatAccounts, type AccountLimit } from "./usage/accounts.js";
import { goalCli, goalReminder, goalView, GOAL_USAGE } from "./usage/goal-cli.js";
import { originOf as originOfThread, GOAL_INSTRUCTIONS, estimateRecord, finishedCount, groupOf, originLabel, stageLabel, remainingLabel } from "./usage/goals.js";
import { createSync, TOKEN_USAGE_EVENT, type EventSource } from "./usage/sync.js";
import { turnSummaries, turnWork, type TurnSummary } from "./usage/turn-summary.js";
import {
  DEFAULT_MS_PER_CALL,
  FORECAST_INSTRUCTIONS,
  msPerCall,
  timeRange,
  growthPerCall,
  settingsAt,
  trackRecordFor,
  TURN_REQUEST_EVENT,
  turnRequestOf,
  forecastInputError,
  formatForecasts,
  parseRange,
  trackRecord,
  additionsInTurn,
  confirmationNotice,
  subagentPricing,
  toTurnForecast,
  SUBAGENT_SAMPLE,
  type ForecastReport,
  type StoredForecast,
} from "./usage/forecast.js";
import { formatTokens } from "./usage/series.js";
import { attributeUsage, promptsByTurn } from "./usage/turns.js";

export { rpcContract } from "./usage/contract.js";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db);
  const goals = createGoalStore(db);
  const recordingSince = store.startedAt(Date.now());
  const settings = bb.settings.define({
    contextWarningAt: {
      type: "string",
      label: "Warn when a thread's context passes (tokens)",
      // Every model call re-reads the whole context, so past this a turn
      // costs tens of millions of tokens. Claude Code's own auto-compact on a
      // 1M-token model waits until about 967K. Empty turns the warning off.
      default: "300K",
    },
    contextErrorAt: {
      type: "string",
      label: "Mark a thread's context as too large past (tokens)",
      // Past this the meter and the page row turn from amber to red. Empty
      // leaves only the warning.
      default: "550K",
    },
    confirmTurnsOver: {
      type: "string",
      label: "Ask before turns over (tokens)",
      description:
        "When a turn's forecast, its subagents included, could pass this many tokens, bb tokenomics forecast tells Claude to stop and ask you before going on. Leave it empty to never ask.",
      default: "10M",
    },
    forecastTurns: {
      type: "boolean",
      label: "Ask Claude to forecast each turn",
      description:
        "Adds a short section to each thread's instructions asking Claude to forecast a turn's model calls with bb tokenomics forecast, so the line under the turn can score it.",
      default: true,
    },
    setGoals: {
      type: "boolean",
      label: "Ask Claude to record each thread's goal",
      description:
        "Adds a short section to each thread's instructions asking Claude to record the thread's goal, its \"Done is\" list, and an estimate with bb tokenomics goal, and to close it with an outcome.",
      default: true,
    },
    goalLine: {
      type: "boolean",
      label: "Show the goal on the thread's token button",
      description: "The goal's donut on the token button in the thread header, and the goal, its \"Done is\" list, and what it has used at the top of the summary it opens.",
      default: true,
    },
    goalSidebar: {
      type: "boolean",
      label: "Show goal progress in the sidebar",
      description: "A donut with a segment per \"Done is\" entry, grouped ones sized and filled by their counts, or the goal's outcome once closed, in each sidebar row whose thread has a goal.",
      default: true,
    },
  });

  const source: EventSource = {
    async listUsage({ threadId, afterSeq, limit }) {
      return bb.sdk.threads.events.list({
        threadId,
        types: [TOKEN_USAGE_EVENT, CONTEXT_EVENT, ...TIMING_EVENTS, TURN_REQUEST_EVENT],
        order: "asc",
        limit: String(limit),
        ...(afterSeq === null ? {} : { afterSeq: String(afterSeq) }),
      });
    },
    async listTurnEvents({ threadId, type, afterSeq, limit }) {
      return bb.sdk.threads.events.list({
        threadId,
        types: [type],
        order: "asc",
        limit: String(limit),
        ...(afterSeq === null ? {} : { afterSeq: String(afterSeq) }),
      });
    },
    async outline(threadId) {
      return (await bb.sdk.threads.conversationOutline({ threadId })).items;
    },
    async listThreads({ archived, offset, limit }) {
      return bb.sdk.threads.list({ archived, includeHidden: true, offset, limit });
    },
  };
  const warn = (threadId: string, error: unknown) =>
    bb.log.warn(`reading usage for ${threadId} failed: ${messageOf(error)}`);
  // Open pages re-read on this. The backfill announces once at the end rather
  // than once per thread.
  let backfilling = false;
  const sync = createSync(store, source, {
    onAdded: (threadId) => {
      if (!backfilling) bb.realtime.publish(USAGE_CHANNEL, { threadIds: [threadId] });
      // A turn ended, so its subagents have written their calls.
      scanSubagents(threadId)
        .then((calls) => {
          if (calls > 0 && !backfilling) bb.realtime.publish(USAGE_CHANNEL, { threadIds: [threadId] });
        })
        .catch((error: unknown) => warn(threadId, error));
    },
    onContext: (threadId) => bb.realtime.publish(CONTEXT_CHANNEL, { threadIds: [threadId] }),
    onTimings: (threadId) => {
      if (!backfilling) bb.realtime.publish(TURNS_CHANNEL, { threadIds: [threadId] });
      // A goal closed mid-turn counts that turn once it ends.
      if (goals.refreshClosed(threadId, Date.now()) > 0) bb.realtime.publish(GOALS_CHANNEL, { threadIds: [threadId] });
    },
    onError: warn,
  });

  /**
   * Reads the thread's Claude Code subagent transcripts past where it last
   * stopped. bb does not report subagents' usage, so this is the only record
   * of it. Returns the calls read.
   */
  async function scanSubagents(threadId: string): Promise<number> {
    let sessionId = store.sessionId(threadId);
    if (sessionId === null) {
      const [event] = await bb.sdk.threads.events.list({
        threadId,
        types: [TOKEN_USAGE_EVENT, CONTEXT_EVENT],
        order: "desc",
        limit: "1",
      });
      const found = (event?.data as { providerThreadId?: unknown } | undefined)?.providerThreadId;
      if (typeof found !== "string") return 0;
      sessionId = found;
      store.setSessionId(threadId, sessionId);
    }
    const dir = await subagentsDir(sessionId);
    if (dir === null) return 0;
    const reads = await readTranscripts(dir, store.subagentOffsets(threadId));
    const wroteAt = Math.max(0, ...reads.flatMap((read) => read.calls.map((call) => call.createdAt)));
    if (wroteAt > (liveSubagents.get(threadId) ?? 0)) liveSubagents.set(threadId, wroteAt);
    return store.recordSubagents(threadId, reads);
  }

  // Background subagents keep writing after their parent's turn ends, and
  // the parent records no usage while it waits on them, so nothing above
  // reads them again. Threads whose subagents wrote recently are read again
  // on a timer: a directory listing and one stat per transcript, no request
  // to bb. A thread drops off once its subagents stop writing.
  const SUBAGENTS_EVERY_MS = 15_000;
  const SUBAGENTS_QUIET_MS = 10 * 60_000;
  const liveSubagents = new Map<string, number>();
  bb.background.service("subagents", {
    async start(signal) {
      while (!signal.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, SUBAGENTS_EVERY_MS);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        const changed: string[] = [];
        for (const [threadId, wroteAt] of liveSubagents) {
          if (signal.aborted) break;
          if (Date.now() - wroteAt > SUBAGENTS_QUIET_MS) {
            liveSubagents.delete(threadId);
            continue;
          }
          try {
            if ((await scanSubagents(threadId)) > 0) changed.push(threadId);
          } catch (error) {
            warn(threadId, error);
          }
        }
        if (changed.length > 0) bb.realtime.publish(USAGE_CHANNEL, { threadIds: changed });
      }
    },
  });

  /**
   * The thread's latest context size. A thread read before the plugin
   * recorded context has its older events behind the cursor, so the first
   * ask reads bb's latest one directly.
   */
  async function latestContext(threadId: string) {
    const recorded = store.latestContext(threadId);
    if (recorded !== null) return recorded;
    const [event] = await bb.sdk.threads.events.list({
      threadId,
      types: [CONTEXT_EVENT],
      order: "desc",
      limit: "1",
    });
    const row = event === undefined ? null : contextRowOf(event);
    if (row !== null) store.recordContext(threadId, [row]);
    return row;
  }

  // Archiving writes no thread events, so these keep the page's Active and
  // Archived lists right without waiting for the next load's backfill.
  const markArchived = (threadId: string, at: number | null) => {
    store.setArchived(threadId, at);
    bb.realtime.publish(USAGE_CHANNEL, { threadIds: [threadId] });
  };
  bb.events.on("thread.archived", ({ thread }) => markArchived(thread.id, thread.archivedAt ?? Date.now()));
  bb.events.on("thread.unarchived", ({ thread }) => markArchived(thread.id, null));
  bb.events.on("thread.deleted", ({ thread }) => {
    markArchived(thread.id, thread.deletedAt ?? Date.now());
    // A goal describes its thread, so it goes with it.
    goals.deleteThread(thread.id);
  });

  bb.events.on("experimental_thread.events", ({ thread }) => {
    sync.syncThread(thread).catch((error: unknown) => warn(thread.id, error));
  });

  // Catches up on every thread once per load: usage bb still holds from before
  // the plugin was installed, and turns that ran while it was not loaded.
  bb.background.service("backfill", {
    async start(signal) {
      backfilling = true;
      try {
        const changed = await sync.syncAll(signal);
        bb.log.info(`backfill found new usage in ${changed.length} threads`);
        // Threads read before the plugin recorded context have their context
        // events behind the cursor. One request each, once, for the latest.
        const missing = store.activeWithoutContext();
        let found = 0;
        for (const threadId of missing) {
          if (signal.aborted) break;
          try {
            if ((await latestContext(threadId)) !== null) found += 1;
          } catch (error) {
            warn(threadId, error);
          }
        }
        if (missing.length > 0) bb.log.info(`backfill read the latest context of ${missing.length} threads, ${found} had one`);
        // Every Claude Code thread's subagents, including ones that finished
        // after their turn's usage was recorded. The first load looks up each
        // thread's session id once, one request per thread; later loads only
        // read transcripts that grew.
        let subagentCalls = 0;
        for (const threadId of store.claudeCodeThreads()) {
          if (signal.aborted) break;
          const thread = { threadId };
          try {
            subagentCalls += await scanSubagents(thread.threadId);
          } catch (error) {
            warn(thread.threadId, error);
          }
        }
        if (subagentCalls > 0) bb.log.info(`backfill read ${subagentCalls} subagent calls`);
        if (changed.length > 0 || found > 0 || subagentCalls > 0) bb.realtime.publish(USAGE_CHANNEL, { threadIds: changed });
      } finally {
        backfilling = false;
      }
    },
  });

  // Every five minutes, one reading of each provider's usage limits: one
  // request to bb, which asks each provider that reports usage. The pace the
  // page shows comes from these readings, so they run whether or not the page
  // is open.
  const LIMITS_EVERY_MS = 5 * 60_000;
  // A reading older than three polls means the provider stopped reporting.
  const LIMITS_STALE_MS = 3 * LIMITS_EVERY_MS;
  let limitsPolledAt: number | null = null;
  let limitsError: string | null = null;
  async function pollLimits(): Promise<void> {
    const now = Date.now();
    try {
      store.recordLimitSamples(samplesFromUsage(await bb.sdk.system.usageLimits(), now));
      store.pruneLimitSamples(now - MAX_WINDOW_MS);
      // Before the readings are pruned for good, the calls they cover keep
      // the account they name.
      store.stampAccounts(accountStretches(store.limitSamplesSince(now - MAX_WINDOW_MS)));
      limitsPolledAt = now;
      limitsError = null;
    } catch (error) {
      limitsError = messageOf(error);
      bb.log.warn(`reading usage limits failed: ${limitsError}`);
    }
    bb.realtime.publish(LIMITS_CHANNEL, {});
  }
  bb.background.service("limits", {
    async start(signal) {
      while (!signal.aborted) {
        await pollLimits();
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, LIMITS_EVERY_MS);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
  });

  async function contextThresholds(): Promise<ContextThresholds> {
    const { contextWarningAt, contextErrorAt } = await settings.get();
    return { warning: parseThreshold(contextWarningAt), error: parseThreshold(contextErrorAt) };
  }

  async function projectNames(): Promise<Map<string, string>> {
    try {
      const projects = await bb.sdk.projects.list();
      return new Map(projects.map((project) => [project.id, project.name]));
    } catch (error) {
      bb.log.warn(`listing projects failed: ${messageOf(error)}`);
      return new Map();
    }
  }

  /** One report per thread that used tokens since `since`. */
  async function threadReports(since: number): Promise<ThreadReport[]> {
    const names = await projectNames();
    const subagents = store.subagentsSince(since);
    const peaks = store.peakContextsSince(since);
    const latest = store.latestContexts();
    const turnTimes = store.turnTimesSince(since);
    const waits = store.waitingSince(since);
    const commandsByThread = new Map<string, Array<{ label: string; ms: number }>>();
    for (const run of store.commandsSince(since)) {
      commandsByThread.set(run.threadId, [...(commandsByThread.get(run.threadId) ?? []), run]);
    }
    return store.threadsSince(since).map((thread) => ({
      threadId: thread.threadId,
      title: thread.title,
      project: names.get(thread.projectId) ?? null,
      provider: thread.providerId,
      archived: thread.archivedAt !== null,
      turns: thread.turns,
      tokens: {
        input: thread.input,
        cacheRead: thread.cacheRead,
        output: thread.output,
        total: thread.input + thread.cacheRead + thread.output,
      },
      subagents: subagents.get(thread.threadId) ?? { count: 0, tokens: 0 },
      context: { peak: peaks.get(thread.threadId) ?? null, latest: latest.get(thread.threadId) ?? null },
      turnTime: turnTimeSummary((turnTimes.get(thread.threadId) ?? []).map((turn) => turn.ms)),
      waitingOnYou: waits.get(thread.threadId) ?? { count: 0, ms: 0 },
      slowestCommands: slowestCommands(commandsByThread.get(thread.threadId) ?? [], 3),
    }));
  }

  /** The thread's turns, with their call counts and Claude's forecasts. */
  function summariesOf(threadId: string): TurnSummary[] {
    return turnSummaries(store.threadRows(threadId, MAX_ROWS), store.threadTimings(threadId), {
      samples: store.threadCallSamples(threadId),
      forecasts: store.threadForecasts(threadId),
      requests: store.threadTurnRequests(threadId),
      subagentRows: store.threadSubagentRows(threadId, MAX_ROWS),
    });
  }

  /**
   * Finished turns with a forecast since `since`, oldest first, across every
   * thread. With `enough`, stops after the threads that forecast most recently
   * hold that many, so a forecast doesn't rebuild every thread's turns.
   */
  function scoredForecasts(since: number, enough = Infinity): ForecastReport[] {
    const reports: ForecastReport[] = [];
    for (const threadId of store.threadsWithForecastsSince(since)) {
      if (reports.length >= enough) break;
      const title = store.threadTitle(threadId);
      for (const turn of summariesOf(threadId)) {
        if (turn.forecast === null || turn.endedAt === null || turn.startedAt < since) continue;
        reports.push({
          threadId,
          title,
          startedAt: turn.startedAt,
          note: turn.forecast.note,
          calls: turn.calls,
          subagentCalls: turn.subagentCalls,
          tokens: turn.input + turn.cacheRead + turn.output,
          workedMs: turn.time === null ? turn.endedAt - turn.startedAt : turn.time.model + turn.time.tools,
          forecast: turn.forecast,
          settings: turn.settings,
        });
      }
    }
    return reports.sort((a, b) => a.startedAt - b.startedAt);
  }

  /** How far back Claude's track record reaches. */
  const RECORD_DAYS = 14;
  /** Enough recent turns for a record per setting; see RECORD_SIZE. */
  const RECORD_TURNS = 60;

  // The instructions hook must answer synchronously, so keep the setting in hand.
  let { forecastTurns, setGoals } = await settings.get();
  settings.onChange((next) => {
    forecastTurns = next.forecastTurns;
    setGoals = next.setGoals;
    // The goal band and the sidebar read their settings from the server.
    bb.realtime.publish(GOALS_CHANNEL, {});
  });
  bb.agents.contributeInstructions(() => {
    const sections = [forecastTurns ? FORECAST_INSTRUCTIONS : null, setGoals ? GOAL_INSTRUCTIONS : null].filter(
      (section): section is string => section !== null,
    );
    return sections.length === 0 ? null : sections.join("\n\n");
  });

  /** How far back goal estimates look for threads that started the same way. */
  const HISTORY_DAYS = 30;
  const goalDeps = {
    goals,
    now: () => Date.now(),
    historySince: () => Date.now() - HISTORY_DAYS * 86_400_000,
    async originOf(threadId: string): Promise<string | null> {
      const recorded = goals.origin(threadId);
      if (recorded !== null) return recorded;
      try {
        const result = (await bb.sdk.threads.get({ threadId })) as { thread?: unknown };
        const thread = (result.thread ?? result) as { originPluginId?: string | null; parentThreadId?: string | null };
        return originOfThread(thread);
      } catch (error) {
        warn(threadId, error);
        return null;
      }
    },
    changed(threadId: string) {
      bb.realtime.publish(GOALS_CHANNEL, { threadIds: [threadId] });
    },
  };

  /** How far back the subagent calls that price a forecast reach. */
  const SUBAGENT_PRICING_MS = 7 * 86_400_000;

  /** The thread's provider's current session size, for the confirmation notice; null when unknown. */
  function sessionSize(threadId: string): { sizeTokens: number } | null {
    const providerId = store.threadProvider(threadId);
    if (providerId === null) return null;
    const now = Date.now();
    const samples = store.limitSamplesSince(now - MAX_WINDOW_MS);
    const view = limitViews(samples, now, LIMITS_STALE_MS).find(
      (candidate) => candidate.kind === "five-hour" && candidate.providerId === providerId,
    );
    if (view === undefined) return null;
    const size = limitSize(view, samples);
    return size == null ? null : { sizeTokens: size };
  }

  /** Records a forecast from `bb tokenomics forecast`; returns what to print. */
  async function recordForecast(
    threadId: string | undefined,
    argv: string[],
  ): Promise<{ exitCode: number; stdout?: string; stderr?: string }> {
    if (threadId === undefined) return { exitCode: 1, stderr: "Run bb tokenomics forecast from inside a bb thread." };
    const confirmed = argv.includes("--confirmed");
    const note = flag(argv, "--note")?.trim().slice(0, 200) || null;
    const { perCall, paceMs: subagentPace } = subagentPricing(store.recentSubagentCalls(Date.now() - SUBAGENT_PRICING_MS, SUBAGENT_SAMPLE));
    const threshold = parseThreshold((await settings.get()).confirmTurnsOver ?? "");
    const addText = flag(argv, "--add-subagent-calls");
    if (addText !== undefined) return recordAddition(threadId, addText, { confirmed, note, perCall, subagentPace, threshold });

    const calls = parseRange(flag(argv, "--calls"));
    if (calls === null) return { exitCode: 1, stderr: "Give the calls as a range, such as --calls 4-8." };
    // Threads that started before minutes were worked out still pass --minutes; it is ignored.
    const waitText = flag(argv, "--wait-minutes");
    const wait = waitText === undefined ? ([0, 0] as [number, number]) : parseRange(waitText);
    if (wait === null) return { exitCode: 1, stderr: "Give --wait-minutes as a range, such as 5-15." };
    const subagentText = flag(argv, "--subagent-calls");
    const subagentCalls = subagentText === undefined ? null : parseRange(subagentText);
    if (subagentText !== undefined && (subagentCalls === null || subagentCalls[1] < subagentCalls[0])) {
      return { exitCode: 1, stderr: "Give --subagent-calls as a range from low to high, such as 100-250." };
    }
    const error = forecastInputError(calls, wait);
    if (error !== null) return { exitCode: 1, stderr: error };
    const callRange: [number, number] = [Math.round(calls[0]), Math.round(calls[1])];
    const subagentRange: [number, number] | null =
      subagentCalls === null ? null : [Math.round(subagentCalls[0]), Math.round(subagentCalls[1])];
    const waitMs: [number, number] = [Math.round(wait[0] * 60_000), Math.round(wait[1] * 60_000)];
    const finished = summariesOf(threadId).filter((turn) => turn.endedAt !== null);
    const pace =
      msPerCall(finished.map((turn) => ({ calls: turn.calls, workedMs: turn.time === null ? null : turn.time.model + turn.time.tools }))) ??
      DEFAULT_MS_PER_CALL;
    const [timeLowMs, timeHighMs] = timeRange(callRange, pace, waitMs);
    // Subagents are timed as if they ran one after another, which a turn
    // that runs several at once comes in under.
    const subagentTime: [number, number] = subagentRange === null ? [0, 0] : [subagentRange[0] * subagentPace, subagentRange[1] * subagentPace];
    const stored: StoredForecast = {
      at: Date.now(),
      callsLow: callRange[0],
      callsHigh: callRange[1],
      timeLowMs: Math.round(timeLowMs + subagentTime[0]),
      timeHighMs: Math.round(timeHighMs + subagentTime[1]),
      context: store.latestContext(threadId)?.usedTokens ?? null,
      growth: growthPerCall(store.threadCallSamples(threadId)),
      paceMs: pace,
      waitLowMs: waitMs[0],
      waitHighMs: waitMs[1],
      note,
      subagentCallsLow: subagentRange?.[0] ?? null,
      subagentCallsHigh: subagentRange?.[1] ?? null,
      subagentPerCall: subagentRange === null ? null : perCall,
      subagentPaceMs: subagentRange === null ? null : subagentPace,
      addition: false,
      confirmed,
    };
    store.recordForecast(threadId, stored);
    bb.realtime.publish(TURNS_CHANNEL, { threadIds: [threadId] });
    // The running turn's settings: the last message sent to the thread, read
    // from bb, since the sync may not have stored this turn's request yet.
    let current = settingsAt(store.threadTurnRequests(threadId), Date.now());
    try {
      const [latest] = await bb.sdk.threads.events.list({ threadId, types: [TURN_REQUEST_EVENT], order: "desc", limit: "1" });
      const request = latest === undefined ? null : turnRequestOf(latest);
      if (request !== null) current = request;
    } catch (error) {
      warn(threadId, error);
    }
    const record = trackRecordFor(scoredForecasts(Date.now() - RECORD_DAYS * 86_400_000, RECORD_TURNS), current);
    const reminder = goalReminder(goals.current(threadId));
    const priced = toTurnForecast(stored);
    const notice = confirmationNotice(priced.tokens ?? priced.subagentTokens ?? null, threshold, confirmed, sessionSize(threadId), formatTokens);
    return {
      exitCode: 0,
      stdout: [`Recorded. ${record}`, notice, reminder].filter((line) => line !== null).join("\n"),
    };
  }

  /**
   * Records subagent calls Claude decided on after forecasting the turn, on
   * top of the turn's first forecast, and checks the new total against the
   * confirmation threshold.
   */
  function recordAddition(
    threadId: string,
    text: string,
    options: { confirmed: boolean; note: string | null; perCall: number; subagentPace: number; threshold: number | null },
  ): { exitCode: number; stdout?: string; stderr?: string } {
    const range = parseRange(text);
    if (range === null || range[1] < range[0] || range[1] < 1) {
      return { exitCode: 1, stderr: "Give --add-subagent-calls as a range from low to high, such as 60-150." };
    }
    const forecasts = store.threadForecasts(threadId);
    const base = forecasts.filter((forecast) => !forecast.addition).at(-1);
    const lastEnd = summariesOf(threadId)
      .map((turn) => turn.endedAt)
      .filter((end): end is number => end !== null)
      .reduce((latest, end) => Math.max(latest, end), 0);
    if (base === undefined || base.at <= lastEnd) {
      return {
        exitCode: 1,
        stderr: "This turn has no forecast to add to. Forecast it with bb tokenomics forecast --calls LOW-HIGH --subagent-calls LOW-HIGH.",
      };
    }
    const calls: [number, number] = [Math.round(range[0]), Math.round(range[1])];
    const addition: StoredForecast = {
      at: Math.max(Date.now(), base.at + 1),
      callsLow: 0,
      callsHigh: 0,
      timeLowMs: calls[0] * options.subagentPace,
      timeHighMs: calls[1] * options.subagentPace,
      context: null,
      growth: null,
      note: options.note,
      subagentCallsLow: calls[0],
      subagentCallsHigh: calls[1],
      subagentPerCall: options.perCall,
      subagentPaceMs: options.subagentPace,
      addition: true,
      confirmed: options.confirmed,
    };
    store.recordForecast(threadId, addition);
    bb.realtime.publish(TURNS_CHANNEL, { threadIds: [threadId] });
    const turn = toTurnForecast(base, [...additionsInTurn(forecasts, base, null), addition]);
    const notice = confirmationNotice(turn.tokens ?? turn.subagentTokens ?? null, options.threshold, options.confirmed, sessionSize(threadId), formatTokens);
    const total = turn.tokens === null ? "" : ` The turn's forecast is now ${formatTokens(turn.tokens[0])}–${formatTokens(turn.tokens[1])} tokens.`;
    return { exitCode: 0, stdout: [`Added ${calls[0]}–${calls[1]} subagent calls.${total}`, notice].filter((line) => line !== null).join("\n") };
  }

  const CLI_USAGE = [
    "bb tokenomics threads [--days N] [--sort tokens|time|context] [--limit N] [--active] [--json]",
    "  One entry per thread that used tokens in the past N days (default 7, at most 30): tokens",
    "  (Claude Code subagents included), turns, peak and latest context, turn times, time spent",
    "  waiting on your answers, and its slowest shell commands. Context sizes, turn times, and",
    "  command times go back only to when Tokenomics began recording them.",
    "bb tokenomics accounts [--days N] [--json]",
    "  Tokens per day for each account a provider was signed in to, subagents included, with each",
    "  account's latest weekly limit. The account comes from bb's usage limit readings, so calls from",
    "  before Tokenomics began reading them show as not known.",
    "bb tokenomics commands [--days N] [--limit N] [--json]",
    "  The shell commands that took the most time across all threads.",
    "bb tokenomics forecast --calls LOW-HIGH [--subagent-calls LOW-HIGH] [--wait-minutes LOW-HIGH] [--confirmed] [--note TEXT]",
    "  Records an 80% forecast of the running turn's model calls, its subagents' calls, and any waits",
    "  you know of. Minutes and tokens follow from the thread's own pace and recent subagents' cost.",
    "  Over the confirmation threshold, says to stop and ask the user; --confirmed once they said to go ahead.",
    "bb tokenomics forecast --add-subagent-calls LOW-HIGH [--confirmed] [--note TEXT]",
    "  Adds subagent calls decided on after forecasting to the running turn's forecast.",
    "  Prints how recent forecasts landed, then the",
    "  goal's open entries and how to mark them.",
    "bb tokenomics forecasts [--days N] [--json]",
    "  Claude's turn forecasts against what each turn took, newest first, after a line on how",
    "  often they landed in range.",
    GOAL_USAGE,
  ].join("\n");

  function flag(argv: string[], name: string): string | undefined {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  }

  bb.cli.register({
    name: "tokenomics",
    summary: "Report token use, context size, and turn times per thread",
    commands: [
      {
        name: "threads",
        summary: "One entry per thread: tokens, context, turn times, slowest commands",
        usage: "bb tokenomics threads [--days N] [--sort tokens|time|context] [--limit N] [--active] [--json]",
      },
      {
        name: "accounts",
        summary: "Tokens per day for each account, with its weekly limit",
        usage: "bb tokenomics accounts [--days N] [--json]",
      },
      {
        name: "commands",
        summary: "The shell commands that took the most time",
        usage: "bb tokenomics commands [--days N] [--limit N] [--json]",
      },
      {
        name: "forecast",
        summary: "Forecast this turn's model calls",
        usage:
          "bb tokenomics forecast --calls LOW-HIGH [--subagent-calls LOW-HIGH] [--wait-minutes LOW-HIGH] [--confirmed] [--note TEXT], or --add-subagent-calls LOW-HIGH",
      },
      {
        name: "forecasts",
        summary: "Claude's turn forecasts against what each turn took",
        usage: "bb tokenomics forecasts [--days N] [--json]",
      },
      {
        name: "goal",
        summary: "Record, move, estimate, close, or show this thread's goal",
        usage: "bb tokenomics goal set|stage|estimate|close|show ...",
      },
    ],
    async run(argv, ctx) {
      const [command] = argv.filter((arg, index) => !arg.startsWith("--") && !argv[index - 1]?.startsWith("--"));
      if (command === undefined || command === "help") return { exitCode: 0, stdout: CLI_USAGE };
      if (command === "forecast") return await recordForecast(ctx.threadId, argv);
      if (command === "goal") return await goalCli(goalDeps, ctx.threadId, argv.slice(argv.indexOf("goal") + 1));
      const json = argv.includes("--json");
      const days = Number(flag(argv, "--days") ?? 7);
      if (!Number.isFinite(days) || days <= 0 || days > 30) {
        return { exitCode: 1, stderr: "--days takes a number from 1 to 30." };
      }
      const since = Date.now() - days * 86_400_000;
      if (command === "threads") {
        const sort = (flag(argv, "--sort") ?? "tokens") as SortKey;
        if (!["tokens", "time", "context"].includes(sort)) {
          return { exitCode: 1, stderr: "--sort takes tokens, time, or context." };
        }
        const limit = Number(flag(argv, "--limit") ?? 20);
        let reports = sortReports(await threadReports(since), sort);
        if (argv.includes("--active")) reports = reports.filter((report) => !report.archived);
        reports = reports.slice(0, Math.max(1, limit));
        return { exitCode: 0, stdout: json ? JSON.stringify(reports, null, 2) : formatThreads(reports, days) };
      }
      if (command === "accounts") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (days - 1));
        const accountDays = store.accountDays(start.getTime());
        const limits = new Map<string, AccountLimit>();
        for (const sample of store.limitSamplesSince(Date.now() - MAX_WINDOW_MS)) {
          if (sample.kind !== "weekly" || sample.model !== null || sample.accountKey === null) continue;
          limits.set(`${sample.providerId}\u0000${sample.accountKey}`, {
            providerId: sample.providerId,
            accountKey: sample.accountKey,
            usedPercent: sample.usedPercent,
            resetsAt: sample.resetsAt,
            sampledAt: sample.sampledAt,
          });
        }
        return {
          exitCode: 0,
          stdout: json
            ? JSON.stringify({ days: accountDays, limits: [...limits.values()] }, null, 2)
            : formatAccounts(accountDays, [...limits.values()], days),
        };
      }
      if (command === "commands") {
        const limit = Number(flag(argv, "--limit") ?? 15);
        const commands = slowestCommands(store.commandsSince(since), Math.max(1, limit));
        return { exitCode: 0, stdout: json ? JSON.stringify(commands, null, 2) : formatCommands(commands, days) };
      }
      if (command === "forecasts") {
        const reports = scoredForecasts(since);
        return { exitCode: 0, stdout: json ? JSON.stringify(reports, null, 2) : formatForecasts(reports, days, formatTokens) };
      }
      return { exitCode: 1, stderr: `Unknown command "${command}".\n\n${CLI_USAGE}` };
    },
  });

  /** Commands the page lists under Shell commands. */
  const TOP_COMMANDS = 3;

  /**
   * The threads with an Impromptu UI card above the composer that still has an
   * open item, so their donut shows them waiting on you. Empty when Impromptu
   * UI isn't installed or the call fails.
   */
  async function threadsWithOpenCards(): Promise<Set<string>> {
    try {
      const result: { threadIds: string[] } = await bb.sdk.plugins.callRpc({
        pluginId: "impromptu-ui",
        method: "waiting_threads",
        input: { days: 14 } as never,
        outputSchema: z.object({ threadIds: z.array(z.string()) }),
      });
      return new Set(result.threadIds);
    } catch {
      return new Set();
    }
  }

  /**
   * The threads among `threadIds` whose last turn failed, such as on a
   * provider error, including one waiting to retry. bb labels a retry's row
   * as a queued message, so only the thread's status tells the two apart.
   * One call for up to 200 threads; empty when it fails.
   */
  async function failedThreads(threadIds: string[]): Promise<Set<string>> {
    if (threadIds.length === 0) return new Set();
    try {
      const threads = (await bb.sdk.threads.list({ threadIds: threadIds.slice(0, 200), includeHidden: true, limit: 200 } as never)) as unknown as {
        id: string;
        status: string;
      }[];
      return new Set(threads.filter((thread) => thread.status === "error").map((thread) => thread.id));
    } catch (error) {
      bb.log.warn(`reading which goal threads failed: ${messageOf(error)}`);
      return new Set();
    }
  }

  /**
   * The tokens the view's account used between two times. Tokens are recorded
   * per provider, so after a switch of accounts only the time this account
   * was signed in counts toward its limits.
   */
  function accountTokens(view: LimitView, samples: readonly LimitSample[]) {
    const spans = accountSpans(samples, view.providerId, view.accountKey);
    return (from: number, to: number) =>
      tokensWithin(spans, from, to, (start, end) => store.providerTokens(start, end).get(view.providerId) ?? 0);
  }

  /**
   * About how many tokens the view's window holds; null when it can't tell.
   * A query for each of up to ten past windows and the current one, and one
   * more for each switch of accounts inside them.
   */
  function limitSize(view: LimitView, samples: readonly LimitSample[]): number | null {
    const spans = accountSpans(samples, view.providerId, view.accountKey);
    const tokens = accountTokens(view, samples);
    return (
      sizeOf(
        samples.filter((sample) => windowKey(sample) === windowKey(view)).sort((a, b) => a.sampledAt - b.sampledAt),
        (from, to) => (seenSince(spans, from) ? tokens(from, to) : null),
      ) ?? null
    );
  }

  bb.rpc.register(rpcContract, {
    usage_limits: () => {
      const now = Date.now();
      // A weekly pace reads the past day and its baseline the day before;
      // a size can read last week's window.
      const samples = store.limitSamplesSince(now - MAX_WINDOW_MS);
      // A subscription bb reports but no thread used this week, such as one
      // signed in once, shows only when it's close to a limit.
      const thisWeek = store.providerTokens(now - 7 * 86_400_000, now);
      const views = limitViews(samples, now, LIMITS_STALE_MS).filter(
        (view) => thisWeek.has(view.providerId) || view.tone !== "ok",
      );
      // Between sessions a provider reports no session at all, and the title
      // bar shows the account's weekly limit, not one model's, with the past
      // five hours' spark instead.
      const account = (view: LimitView) => `${view.providerId}\n${view.accountKey}`;
      const inSession = new Set(views.filter((view) => view.kind === "five-hour").map(account));
      const oneModel = new Set(samples.filter((sample) => sample.model !== null).map(windowKey));
      return {
        limits: views.map((view) => {
          const tokens = accountTokens(view, samples);
          return {
            ...view,
            lastHourTokens: tokens(now - 3_600_000, now),
            sizeTokens: limitSize(view, samples),
            // A session lasts five hours and resets on the hour's minute it began.
            ...(view.kind === "five-hour"
              ? { slots: store.providerSlots(view.providerId, view.resetsAt - 5 * 3_600_000, now, SLOT_MS) }
              : view.kind === "weekly" && !inSession.has(account(view)) && !oneModel.has(windowKey(view))
                ? { slots: store.providerSlots(view.providerId, now - 5 * 3_600_000, now, SLOT_MS) }
                : {}),
          };
        }),
        polledAt: limitsPolledAt,
        error: limitsError,
      };
    },
    usage_hours: ({ since }) => ({ hours: store.hoursSince(Math.max(since, Date.now() - MAX_WINDOW_MS)) }),
    session_threads: ({ since, providerId, limit }) => {
      const floor = Math.max(since, Date.now() - MAX_WINDOW_MS);
      const now = Date.now();
      const ranked = store
        .threadsSince(floor)
        .filter((thread) => thread.providerId === providerId)
        .map((thread) => ({ thread, tokens: thread.input + thread.cacheRead + thread.output }))
        .sort((a, b) => b.tokens - a.tokens);
      const shown = ranked.slice(0, limit);
      const rest = ranked.slice(limit);
      // One local query for the window's threads, then one for each listed
      // thread's goal and one for what that goal has used.
      return {
        threads: shown.map(({ thread, tokens }) => {
          const goal = goals.current(thread.threadId);
          return {
            threadId: thread.threadId,
            title: thread.title,
            archivedAt: thread.archivedAt,
            tokens,
            goal:
              goal === null || goal.shape === "none"
                ? null
                : {
                    states: goal.entries.map((entry) => entry.state),
                    counts: goal.entries.map((entry) => entry.count ?? null),
                    outcome: goal.outcome,
                    spentTokens: goals.spentOn(goal, now).tokens,
                    estimate: goal.estimate.tokens === null ? null : ([goal.estimate.tokens.low, goal.estimate.tokens.high] as [number, number]),
                  },
          };
        }),
        more: { count: rest.length, tokens: rest.reduce((sum, { tokens }) => sum + tokens, 0) },
      };
    },
    usage_window: async ({ since }) => {
      const floor = Math.max(since, Date.now() - MAX_WINDOW_MS);
      const [names, thresholds] = await Promise.all([projectNames(), contextThresholds()]);
      const contexts = store.latestContexts();
      const turnTimes = store.turnTimesSince(floor);
      const hoursByThread = new Map<string, Array<{ hour: number; total: number }>>();
      for (const { threadId, hour, total } of store.threadHoursSince(floor)) {
        const hours = hoursByThread.get(threadId) ?? [];
        hours.push({ hour, total });
        hoursByThread.set(threadId, hours);
      }
      return {
        hours: store.hoursSince(floor),
        threads: store.threadsSince(floor).map((thread) => ({
          ...thread,
          projectName: names.get(thread.projectId) ?? null,
          context: contexts.get(thread.threadId) ?? null,
          turnTimes: turnTimes.get(thread.threadId) ?? [],
          hours: hoursByThread.get(thread.threadId) ?? [],
          // One local query per listed thread, the same total its header shows.
          lifetime: store.threadTotal(thread.threadId).total,
        })),
        recordingSince,
        contextThresholds: thresholds,
        turnTime: {
          ...timeBreakdown(store.timingsSince(floor)),
          commands: slowestCommands(store.commandsSince(floor), TOP_COMMANDS),
        },
      };
    },
    thread_usage: ({ threadId }) => {
      const { tokens, total, turns, subagents } = store.threadTotal(threadId);
      return { ...tokens, total, turns, subagents, recent: store.threadRows(threadId, MAX_ROWS) };
    },
    thread_context: async ({ threadId }) => {
      const [context, thresholds] = await Promise.all([latestContext(threadId), contextThresholds()]);
      const [last] = store.threadRows(threadId, 1);
      return {
        context:
          context === null
            ? null
            : {
                usedTokens: context.usedTokens,
                contextWindow: context.contextWindow,
                autoCompactAt: context.autoCompactAt,
                at: context.createdAt,
              },
        lastTurn: last === undefined ? null : last.input + last.cacheRead + last.output,
        thresholds,
        archived: store.isArchived(threadId),
        cacheExpiresAt: store.cacheExpiresAt(threadId),
      };
    },
    context_levels: async () => countLevels(store.activeLatestContexts(), await contextThresholds()),
    compact_thread: async ({ threadId }) => {
      await bb.sdk.threads.compact({ threadId });
      return { ok: true as const };
    },
    thread_goal: async ({ threadId }) => {
      const { goalLine } = await settings.get();
      const goal = goals.current(threadId);
      return { show: goalLine, goal: goal === null ? null : goalView(goalDeps, goal) };
    },
    sidebar_goals: async () => {
      const { goalSidebar } = await settings.get();
      if (!goalSidebar) return { show: false, goals: [] };
      const now = Date.now();
      const active = goals.activeCurrent();
      const [openCards, failed] = await Promise.all([threadsWithOpenCards(), failedThreads(active.map((goal) => goal.threadId))]);
      // One local query for the goals, one per goal for what it has used, one
      // call to Impromptu UI for the threads with an open card, and one to bb
      // for the threads whose last turn failed.
      return {
        show: true,
        goals: active.flatMap((goal) => {
          const label = stageLabel(goal);
          if (label === null) return [];
          return [{ threadId: goal.threadId, label, stages: goal.entries.length, reached: finishedCount(goal.entries), states: goal.entries.map((entry) => entry.state), counts: goal.entries.map((entry) => entry.count ?? null), outcome: goal.outcome, left: remainingLabel(goal, goals.spentOn(goal, now)), openCard: openCards.has(goal.threadId), failed: failed.has(goal.threadId) }];
        }),
      };
    },
    goal_outcomes: ({ since }) => {
      const all = goals.since(since);
      // The latest goal of each thread stands for it; earlier ones were revised.
      const latest = new Map(all.map((goal) => [goal.threadId, goal]));
      const closed = [...latest.values()].filter((goal) => goal.outcome !== null && goal.spentAtEnd !== null);
      const outcomes = (["met", "partly", "not"] as const).map((outcome) => {
        const group = groupOf(outcome, closed.filter((goal) => goal.outcome === outcome).map((goal) => goal.spentAtEnd!));
        return { outcome, count: group.count, medianTokens: group.medianTokens, medianMinutes: group.medianMinutes };
      });
      const open = [...latest.values()].filter((goal) => goal.outcome === null && goal.shape !== "none").length;
      // Whole archived threads by how they started, with a goal against without.
      const withGoal = new Set([...latest.values()].filter((goal) => goal.shape !== "none").map((goal) => goal.threadId));
      const byOrigin = new Map<string, { with: Array<{ turns: number; tokens: number; ms: number }>; without: Array<{ turns: number; tokens: number; ms: number }> }>();
      for (const thread of goals.archivedThreads(since)) {
        const origin = thread.origin ?? "unknown";
        const entry = byOrigin.get(origin) ?? { with: [], without: [] };
        (withGoal.has(thread.threadId) ? entry.with : entry.without).push(thread);
        byOrigin.set(origin, entry);
      }
      const byStart = [...byOrigin.entries()]
        .map(([origin, entry]) => ({
          origin: originLabel(origin),
          withGoal: groupOf("with a goal", entry.with),
          withoutGoal: groupOf("without", entry.without),
        }))
        .sort((a, b) => b.withGoal.count + b.withoutGoal.count - (a.withGoal.count + a.withoutGoal.count));
      return { outcomes, open, byStart, estimates: estimateRecord(all) };
    },
    thread_turn_summaries: ({ threadId }) => ({ turns: summariesOf(threadId) }),
    thread_turn_work: ({ threadId, turnId }) => turnWork(store.threadTimings(threadId), turnId),
    thread_turns: async ({ threadId }) => {
      const { started, completed, outline } = await sync.turnContext(threadId);
      const rows = store.threadRows(threadId, MAX_ROWS);
      const splits = turnSplits(store.threadTimings(threadId));
      const turns = attributeUsage(rows, started, completed, promptsByTurn(outline));
      return { turns: turns.map((turn) => ({ ...turn, time: turn.turnId === null ? null : (splits.get(turn.turnId) ?? null) })) };
    },
  });
}

// bb-plugin-tokenomics — how many tokens each thread uses, and when.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { CONTEXT_CHANNEL, MAX_ROWS, MAX_WINDOW_MS, rpcContract, USAGE_CHANNEL } from "./usage/contract.js";
import { TIMING_EVENTS, turnSplits } from "./usage/timing.js";
import { CONTEXT_EVENT, contextRowOf, parseThreshold, type ContextThresholds } from "./usage/context.js";
import { createStore, MIGRATIONS } from "./usage/store.js";
import { createSync, TOKEN_USAGE_EVENT, type EventSource } from "./usage/sync.js";
import { attributeUsage, promptsByTurn } from "./usage/turns.js";

export { rpcContract } from "./usage/contract.js";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db);
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
  });

  const source: EventSource = {
    async listUsage({ threadId, afterSeq, limit }) {
      return bb.sdk.threads.events.list({
        threadId,
        types: [TOKEN_USAGE_EVENT, CONTEXT_EVENT, ...TIMING_EVENTS],
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
    },
    onContext: (threadId) => bb.realtime.publish(CONTEXT_CHANNEL, { threadIds: [threadId] }),
    onError: warn,
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
  bb.events.on("thread.deleted", ({ thread }) => markArchived(thread.id, thread.deletedAt ?? Date.now()));

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
        if (changed.length > 0 || found > 0) bb.realtime.publish(USAGE_CHANNEL, { threadIds: changed });
      } finally {
        backfilling = false;
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

  bb.rpc.register(rpcContract, {
    usage_window: async ({ since }) => {
      const floor = Math.max(since, Date.now() - MAX_WINDOW_MS);
      const [names, thresholds] = await Promise.all([projectNames(), contextThresholds()]);
      const contexts = store.latestContexts();
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
          hours: hoursByThread.get(thread.threadId) ?? [],
        })),
        recordingSince,
        contextThresholds: thresholds,
      };
    },
    thread_usage: ({ threadId }) => {
      const { tokens, total, turns } = store.threadTotal(threadId);
      return { ...tokens, total, turns, recent: store.threadRows(threadId, MAX_ROWS) };
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
      };
    },
    compact_thread: async ({ threadId }) => {
      await bb.sdk.threads.compact({ threadId });
      return { ok: true as const };
    },
    thread_turns: async ({ threadId }) => {
      const { started, completed, outline } = await sync.turnContext(threadId);
      const rows = store.threadRows(threadId, MAX_ROWS);
      const splits = turnSplits(store.threadTimings(threadId));
      const turns = attributeUsage(rows, started, completed, promptsByTurn(outline));
      return { turns: turns.map((turn) => ({ ...turn, time: turn.turnId === null ? null : (splits.get(turn.turnId) ?? null) })) };
    },
  });
}

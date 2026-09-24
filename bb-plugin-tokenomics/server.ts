// bb-plugin-tokenomics — how many tokens each thread uses, and when.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { MAX_ROWS, MAX_WINDOW_MS, rpcContract, USAGE_CHANNEL } from "./usage/contract.js";
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

  const source: EventSource = {
    async listUsage({ threadId, afterSeq, limit }) {
      return bb.sdk.threads.events.list({
        threadId,
        types: [TOKEN_USAGE_EVENT],
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
    onError: warn,
  });

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
        if (changed.length > 0) bb.realtime.publish(USAGE_CHANNEL, { threadIds: changed });
      } finally {
        backfilling = false;
      }
    },
  });

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
      const names = await projectNames();
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
          hours: hoursByThread.get(thread.threadId) ?? [],
        })),
        recordingSince,
      };
    },
    thread_usage: ({ threadId }) => {
      const { tokens, total, turns } = store.threadTotal(threadId);
      return { ...tokens, total, turns, recent: store.threadRows(threadId, MAX_ROWS) };
    },
    thread_turns: async ({ threadId }) => {
      const { started, completed, outline } = await sync.turnContext(threadId);
      const rows = store.threadRows(threadId, MAX_ROWS);
      return { turns: attributeUsage(rows, started, completed, promptsByTurn(outline)) };
    },
  });
}

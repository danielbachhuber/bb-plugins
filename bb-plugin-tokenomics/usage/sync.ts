// Copies token usage from bb's thread events into the ledger. The only module
// that talks to bb; the store and the arithmetic stay pure.
import { splitBreakdown, type ProviderTokenBreakdown } from "./breakdown.js";
import type { Store, ThreadInfo, UsageRow } from "./store.js";

export const TOKEN_USAGE_EVENT = "thread/tokenUsage/updated";

/** bb's limit for one page of events or threads. */
const PAGE_SIZE = 100;

/** The fields of bb's thread DTOs this module reads. */
export interface ThreadLike {
  id: string;
  title: string | null;
  titleFallback?: string | null;
  projectId: string;
  providerId: string;
}

/** The fields of a token usage event row this module reads. */
export interface UsageEventLike {
  id: string;
  seq: number;
  createdAt: number;
  type: string;
  data: unknown;
}

export interface EventSource {
  listUsage(args: { threadId: string; afterSeq: number | null; limit: number }): Promise<UsageEventLike[]>;
  listThreads(args: { archived: boolean; offset: number; limit: number }): Promise<ThreadLike[]>;
}

interface UsagePayload {
  tokenUsage?: { total?: ProviderTokenBreakdown; last?: ProviderTokenBreakdown };
}

/** The ledger row for one event, or null when the event carries no usage. */
export function usageRowOf(event: UsageEventLike): UsageRow | null {
  if (event.type !== TOKEN_USAGE_EVENT) return null;
  const usage = (event.data as UsagePayload | null)?.tokenUsage;
  if (usage?.last === undefined) return null;
  const tokens = splitBreakdown(usage.last);
  return {
    eventId: event.id,
    createdAt: event.createdAt,
    tokens,
    runningTotal: Math.max(0, usage.total?.totalTokens ?? 0),
  };
}

export function threadInfoOf(thread: ThreadLike): ThreadInfo {
  return {
    threadId: thread.id,
    title: thread.title ?? thread.titleFallback ?? null,
    projectId: thread.projectId,
    providerId: thread.providerId,
  };
}

export interface SyncHooks {
  /** Called after rows are added for a thread, however the read started. */
  onAdded?: (threadId: string) => void;
  onError?: (threadId: string, error: unknown) => void;
}

export function createSync(store: Store, source: EventSource, hooks: SyncHooks = {}) {
  // One read per thread at a time; a request that arrives mid-read runs once
  // more afterwards, so an event that landed during the read is not missed.
  const running = new Map<string, Promise<number>>();
  const again = new Map<string, ThreadLike>();

  async function read(thread: ThreadLike): Promise<number> {
    const info = threadInfoOf(thread);
    let cursor = store.cursor(thread.id);
    let added = 0;
    for (;;) {
      const events = await source.listUsage({ threadId: thread.id, afterSeq: cursor, limit: PAGE_SIZE });
      const rows = events.map(usageRowOf).filter((row): row is UsageRow => row !== null);
      const lastSeq = events.reduce((seq, event) => Math.max(seq, event.seq), cursor ?? 0);
      added += store.record(info, rows, lastSeq);
      cursor = lastSeq;
      if (events.length < PAGE_SIZE) break;
    }
    if (added > 0) hooks.onAdded?.(thread.id);
    return added;
  }

  /** Reads the thread's new usage events. Resolves with the rows added. */
  function syncThread(thread: ThreadLike): Promise<number> {
    const current = running.get(thread.id);
    if (current !== undefined) {
      again.set(thread.id, thread);
      return current;
    }
    const run = read(thread).finally(() => {
      running.delete(thread.id);
      const next = again.get(thread.id);
      if (next !== undefined) {
        again.delete(thread.id);
        syncThread(next).catch((error: unknown) => hooks.onError?.(thread.id, error));
      }
    });
    running.set(thread.id, run);
    return run;
  }

  /**
   * Reads every thread, archived ones included, so usage bb still holds from
   * before the plugin was installed reaches the ledger. Returns the ids of
   * threads that gained rows; `onAdded` is called for each of them as well.
   */
  async function syncAll(signal: AbortSignal): Promise<string[]> {
    const changed: string[] = [];
    for (const archived of [false, true]) {
      for (let offset = 0; !signal.aborted; offset += PAGE_SIZE) {
        const threads = await source.listThreads({ archived, offset, limit: PAGE_SIZE });
        for (const thread of threads) {
          if (signal.aborted) return changed;
          if ((await syncThread(thread)) > 0) changed.push(thread.id);
        }
        if (threads.length < PAGE_SIZE) break;
      }
    }
    return changed;
  }

  return { syncThread, syncAll };
}

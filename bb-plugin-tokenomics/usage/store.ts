// The usage ledger, in the plugin's own database.
//
// bb prunes a thread's older token usage events once the thread has a few
// hundred newer events, keeping only the latest one. So the plugin copies each
// turn's usage here as it arrives, and the page and the header read from here
// rather than from bb's events.
import type { Database } from "better-sqlite3";

import { addTokens, totalOf, ZERO_TOKENS, type Tokens } from "./breakdown.js";

/**
 * APPEND-ONLY. Statement index is the migration id. Never edit or reorder a
 * shipped statement; only push new ones.
 */
export const MIGRATIONS = [
  // One row per bb token usage event: that turn's usage, and the provider's
  // running total for the thread at the time.
  `CREATE TABLE IF NOT EXISTS usage (
     event_id TEXT PRIMARY KEY,
     thread_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     input INTEGER NOT NULL,
     cache_read INTEGER NOT NULL,
     output INTEGER NOT NULL,
     running_total INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS usage_created_at_idx ON usage (created_at)`,
  `CREATE INDEX IF NOT EXISTS usage_thread_idx ON usage (thread_id, created_at)`,
  // What the page shows for a thread, and how far its events have been read.
  `CREATE TABLE IF NOT EXISTS threads (
     thread_id TEXT PRIMARY KEY,
     title TEXT,
     project_id TEXT NOT NULL,
     provider_id TEXT NOT NULL,
     last_seq INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  // When the thread was archived or deleted, or null while it is active, so
  // the page can list active and archived threads apart.
  `ALTER TABLE threads ADD COLUMN archived_at INTEGER`,
];

export interface ThreadInfo {
  threadId: string;
  title: string | null;
  projectId: string;
  providerId: string;
  /** When it was archived or deleted; null while it is active. */
  archivedAt: number | null;
}

export interface UsageRow {
  eventId: string;
  createdAt: number;
  tokens: Tokens;
  runningTotal: number;
}

export interface HourUsage extends Tokens {
  /** Start of the hour, in epoch milliseconds. */
  hour: number;
}

export interface ThreadUsage extends Tokens {
  threadId: string;
  title: string | null;
  projectId: string;
  providerId: string;
  archivedAt: number | null;
  turns: number;
}

export interface ThreadHour {
  threadId: string;
  /** Start of the hour, in epoch milliseconds. */
  hour: number;
  total: number;
}

export interface UsageAt extends Tokens {
  /** When bb recorded the usage, in epoch milliseconds. */
  at: number;
}

export interface ThreadTotal {
  tokens: Tokens;
  /**
   * The best total for the thread's whole life. The sum of recorded turns
   * misses turns bb pruned before they were recorded; the provider's running
   * total misses turns before its last restart. Each undercounts in a
   * different way, so this is the larger of the two.
   */
  total: number;
  turns: number;
}

const HOUR_MS = 3_600_000;

export function createStore(db: Database) {
  const insertUsage = db.prepare(
    `INSERT OR IGNORE INTO usage
       (event_id, thread_id, created_at, input, cache_read, output, running_total)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const upsertThread = db.prepare(
    `INSERT INTO threads (thread_id, title, project_id, provider_id, last_seq, archived_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (thread_id) DO UPDATE SET
       title = excluded.title,
       project_id = excluded.project_id,
       provider_id = excluded.provider_id,
       last_seq = max(threads.last_seq, excluded.last_seq),
       archived_at = excluded.archived_at`,
  );
  const updateArchived = db.prepare(`UPDATE threads SET archived_at = ? WHERE thread_id = ?`);
  const selectThreadHours = db.prepare(
    `SELECT thread_id AS threadId, (created_at / ${HOUR_MS}) * ${HOUR_MS} AS hour,
            sum(input + cache_read + output) AS total
     FROM usage WHERE created_at >= ?
     GROUP BY thread_id, hour ORDER BY hour`,
  );
  const selectCursor = db.prepare(`SELECT last_seq FROM threads WHERE thread_id = ?`);
  const selectMeta = db.prepare(`SELECT value FROM meta WHERE key = ?`);
  const insertMeta = db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)`);
  const selectHours = db.prepare(
    `SELECT (created_at / ${HOUR_MS}) * ${HOUR_MS} AS hour,
            sum(input) AS input, sum(cache_read) AS cacheRead, sum(output) AS output
     FROM usage WHERE created_at >= ?
     GROUP BY hour ORDER BY hour`,
  );
  const selectThreads = db.prepare(
    `SELECT u.thread_id AS threadId, t.title AS title,
            coalesce(t.project_id, '') AS projectId, coalesce(t.provider_id, '') AS providerId,
            t.archived_at AS archivedAt,
            sum(u.input) AS input, sum(u.cache_read) AS cacheRead, sum(u.output) AS output,
            count(*) AS turns
     FROM usage u LEFT JOIN threads t ON t.thread_id = u.thread_id
     WHERE u.created_at >= ?
     GROUP BY u.thread_id
     ORDER BY sum(u.input) + sum(u.cache_read) + sum(u.output) DESC`,
  );
  const selectThreadTotal = db.prepare(
    `SELECT coalesce(sum(input), 0) AS input, coalesce(sum(cache_read), 0) AS cacheRead,
            coalesce(sum(output), 0) AS output, count(*) AS turns,
            coalesce(max(running_total), 0) AS runningTotal
     FROM usage WHERE thread_id = ?`,
  );

  const selectRows = db.prepare(
    `SELECT at, input, cacheRead, output FROM (
       SELECT created_at AS at, input, cache_read AS cacheRead, output
       FROM usage WHERE thread_id = ?
       ORDER BY created_at DESC LIMIT ?
     ) ORDER BY at`,
  );

  const record = db.transaction((thread: ThreadInfo, rows: UsageRow[], lastSeq: number) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insertUsage.run(
        row.eventId,
        thread.threadId,
        row.createdAt,
        row.tokens.input,
        row.tokens.cacheRead,
        row.tokens.output,
        row.runningTotal,
      );
      inserted += Number(result.changes);
    }
    upsertThread.run(thread.threadId, thread.title, thread.projectId, thread.providerId, lastSeq, thread.archivedAt);
    return inserted;
  });

  return {
    /** The last event sequence read for this thread, or null if never read. */
    cursor(threadId: string): number | null {
      const row = selectCursor.get(threadId) as { last_seq: number } | undefined;
      return row?.last_seq ?? null;
    },

    /** Stores new usage rows and moves the thread's cursor. Returns rows added. */
    record(thread: ThreadInfo, rows: UsageRow[], lastSeq: number): number {
      return record(thread, rows, lastSeq);
    },

    /** When the ledger was first opened; set once, on the first call. */
    startedAt(now: number): number {
      insertMeta.run("started_at", String(now));
      const row = selectMeta.get("started_at") as { value: string };
      return Number(row.value);
    },

    hoursSince(since: number): HourUsage[] {
      return selectHours.all(since) as HourUsage[];
    },

    threadsSince(since: number): ThreadUsage[] {
      return selectThreads.all(since) as ThreadUsage[];
    },

    /** Each thread's tokens per hour since `since`, for the page's sparklines. */
    threadHoursSince(since: number): ThreadHour[] {
      return selectThreadHours.all(since) as ThreadHour[];
    },

    /** Marks a thread archived or deleted at `at`, or active again when null. */
    setArchived(threadId: string, at: number | null): void {
      updateArchived.run(at, threadId);
    },

    /** The thread's most recent usage rows, oldest first. */
    threadRows(threadId: string, limit: number): UsageAt[] {
      return selectRows.all(threadId, limit) as UsageAt[];
    },

    threadTotal(threadId: string): ThreadTotal {
      const row = selectThreadTotal.get(threadId) as Tokens & {
        turns: number;
        runningTotal: number;
      };
      const tokens = addTokens(ZERO_TOKENS, row);
      return {
        tokens,
        total: Math.max(totalOf(tokens), row.runningTotal),
        turns: row.turns,
      };
    },
  };
}

export type Store = ReturnType<typeof createStore>;

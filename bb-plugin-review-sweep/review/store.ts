import type { ClassifiedRow, SweepResult } from "./types.js";

/**
 * APPEND-ONLY. Statement index is the migration id. Never edit or reorder a
 * shipped statement; only push new ones.
 */
export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS rows (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     payload TEXT NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     swept_at INTEGER,
     truncated INTEGER NOT NULL DEFAULT 0,
     last_error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS review_threads (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     thread_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  `CREATE TABLE IF NOT EXISTS snoozes (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     until INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  // Repositories whose review requests were dropped, because no bb project on
  // this machine has their remote. Stored so the panel can say why it is empty
  // instead of reading as "nobody is waiting on you".
  `ALTER TABLE meta ADD COLUMN skipped_repos TEXT NOT NULL DEFAULT '[]'`,
];

export interface SweepMeta {
  sweptAt: number | null;
  skippedRepos: string[];
  truncated: boolean;
  lastError: string | null;
}

interface StatementLike {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

export interface DatabaseLike {
  prepare(sql: string): StatementLike;
  exec(sql: string): unknown;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
}

export interface Store {
  /**
   * The sweep is a single call, so it either returns the whole queue or fails.
   * There is no partial state to preserve: unlike pr-sweep, which keeps the
   * last known rows for a repository whose detail call failed, a failure here
   * leaves the previous rows untouched and records the error.
   */
  replaceAll(result: SweepResult): void;
  readRows(): ClassifiedRow[];
  readMeta(): SweepMeta;
  recordFailure(message: string): void;
  /**
   * Links from a checkout that predates gh-context, for the one-time move of
   * them into it. Empty once they have moved and the table is gone.
   */
  legacyThreadLinks(): Array<{ repo: string; number: number; threadId: string; createdAt: number }>;
  /** Drops the legacy link table once gh-context holds its rows. */
  dropLegacyThreadLinks(): void;
  /**
   * Hides a review until `until`. Snoozing an already-snoozed review replaces
   * the old deadline rather than extending it, so a second click is idempotent
   * from the same instant rather than compounding.
   */
  snooze(repo: string, number: number, until: number, now: number): void;
  unsnooze(repo: string, number: number): void;
  /**
   * repo#number -> deadline, for stamping the whole listing in one read.
   *
   * Filtered by `now` rather than trusted wholesale: a deadline that has passed
   * is not a snooze, and reading is the moment that matters. Expired rows are
   * left on disk for `pruneSnoozes` to clear, because a read must not write.
   */
  snoozesUntil(now: number): Map<string, number>;
  /** Drops deadlines already in the past. Returns how many went. */
  pruneSnoozes(now: number): number;
}

export function createStore(db: DatabaseLike): Store {
  const deleteAllRows = db.prepare(`DELETE FROM rows`);
  const insertRow = db.prepare(`INSERT INTO rows (repo, number, payload) VALUES (?, ?, ?)`);
  const selectRows = db.prepare(`SELECT payload FROM rows`);
  const selectMeta = db.prepare(
    `SELECT swept_at, skipped_repos, truncated, last_error FROM meta WHERE id = 1`,
  );
  const upsertMeta = db.prepare(
    `INSERT INTO meta (id, swept_at, skipped_repos, truncated, last_error)
     VALUES (1, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       swept_at = excluded.swept_at,
       skipped_repos = excluded.skipped_repos,
       truncated = excluded.truncated,
       last_error = NULL`,
  );
  const upsertFailure = db.prepare(
    `INSERT INTO meta (id, swept_at, skipped_repos, truncated, last_error)
     VALUES (1, NULL, '[]', 0, ?)
     ON CONFLICT(id) DO UPDATE SET last_error = excluded.last_error`,
  );
  function hasTable(name: string): boolean {
    return (
      db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !==
      undefined
    );
  }
  const insertSnooze = db.prepare(
    `INSERT INTO snoozes (repo, number, until, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo, number) DO UPDATE SET
       until = excluded.until,
       created_at = excluded.created_at`,
  );
  const deleteSnooze = db.prepare(`DELETE FROM snoozes WHERE repo = ? AND number = ?`);
  const selectSnoozes = db.prepare(`SELECT repo, number, until FROM snoozes WHERE until > ?`);
  const deleteExpiredSnoozes = db.prepare(`DELETE FROM snoozes WHERE until <= ?`);
  const countExpiredSnoozes = db.prepare(
    `SELECT COUNT(*) AS expired FROM snoozes WHERE until <= ?`,
  );

  const writeAll = db.transaction(
    ((rows: ClassifiedRow[], sweptAt: number, skippedRepos: string, truncated: number) => {
      deleteAllRows.run();
      for (const row of rows) insertRow.run(row.repo, row.number, JSON.stringify(row));
      upsertMeta.run(sweptAt, skippedRepos, truncated);
    }) as (rows: ClassifiedRow[], sweptAt: number, skippedRepos: string, truncated: number) => void,
  );

  return {
    replaceAll(result) {
      writeAll(
        result.rows,
        result.sweptAt,
        JSON.stringify(result.skippedRepos ?? []),
        result.truncated ? 1 : 0,
      );
    },

    readRows() {
      return (selectRows.all() as Array<{ payload: string }>).map(
        (entry) => JSON.parse(entry.payload) as ClassifiedRow,
      );
    },

    readMeta() {
      const meta = selectMeta.get() as
        | {
            swept_at: number | null;
            skipped_repos: string;
            truncated: number;
            last_error: string | null;
          }
        | undefined;
      if (!meta) return { sweptAt: null, skippedRepos: [], truncated: false, lastError: null };
      return {
        sweptAt: meta.swept_at,
        skippedRepos: JSON.parse(meta.skipped_repos ?? "[]") as string[],
        truncated: meta.truncated === 1,
        lastError: meta.last_error,
      };
    },

    recordFailure(message) {
      upsertFailure.run(message);
    },

    legacyThreadLinks() {
      // Prepared here rather than up front: the table is dropped once its rows
      // have moved, and preparing against a missing table throws.
      if (!hasTable("review_threads")) return [];
      return (
        db
          .prepare(`SELECT repo, number, thread_id, created_at FROM review_threads ORDER BY created_at`)
          .all() as Array<{ repo: string; number: number; thread_id: string; created_at: number }>
      ).map((row) => ({
        repo: row.repo,
        number: row.number,
        threadId: row.thread_id,
        createdAt: row.created_at,
      }));
    },

    dropLegacyThreadLinks() {
      db.exec(`DROP TABLE IF EXISTS review_threads`);
    },

    snooze(repo, number, until, now) {
      insertSnooze.run(repo, number, until, now);
    },

    unsnooze(repo, number) {
      deleteSnooze.run(repo, number);
    },

    snoozesUntil(now) {
      const snoozes = selectSnoozes.all(now) as Array<{
        repo: string;
        number: number;
        until: number;
      }>;
      return new Map(snoozes.map((entry) => [`${entry.repo}#${entry.number}`, entry.until]));
    },

    pruneSnoozes(now) {
      const { expired } = countExpiredSnoozes.get(now) as { expired: number };
      if (expired > 0) deleteExpiredSnoozes.run(now);
      return expired;
    },
  };
}

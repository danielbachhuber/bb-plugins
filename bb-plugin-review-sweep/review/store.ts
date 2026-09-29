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
  // The local next-step note on a row. Kept apart from `rows`, which each
  // sweep replaces wholesale, and never sent to GitHub.
  `CREATE TABLE IF NOT EXISTS notes (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     body TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  // The comment count when a pull request was last opened from the panel, so
  // the row can say how many are new since.
  `CREATE TABLE IF NOT EXISTS seen (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     comments INTEGER NOT NULL,
     seen_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
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
  /** Every note, keyed `repo#number`. */
  notes(): Map<string, string>;
  /** Saves a note. Empty or blank text deletes it instead. */
  setNote(repo: string, number: number, body: string, now: number): void;
  /** The comment count each pull request was last seen at, keyed `repo#number`. */
  seenCounts(): Map<string, number>;
  /**
   * Records the current count for every row not seen before, and leaves the
   * rest alone. Run on every sweep, so a review is never "new" merely because
   * this is the first sweep to list it.
   */
  recordFirstSeen(rows: readonly ClassifiedRow[], now: number): void;
  /** Records the count a pull request has now, when it is opened from the panel. */
  markSeen(repo: string, number: number, comments: number, now: number): void;
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

  const selectNotes = db.prepare(`SELECT repo, number, body FROM notes`);
  const upsertNote = db.prepare(
    `INSERT INTO notes (repo, number, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(repo, number) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  );
  const deleteNote = db.prepare(`DELETE FROM notes WHERE repo = ? AND number = ?`);
  const selectSeen = db.prepare(`SELECT repo, number, comments FROM seen`);
  const insertSeen = db.prepare(
    `INSERT OR IGNORE INTO seen (repo, number, comments, seen_at) VALUES (?, ?, ?, ?)`,
  );
  const upsertSeen = db.prepare(
    `INSERT INTO seen (repo, number, comments, seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(repo, number) DO UPDATE SET comments = excluded.comments, seen_at = excluded.seen_at`,
  );
  const writeFirstSeen = db.transaction(((rows: readonly ClassifiedRow[], now: number) => {
    for (const row of rows) insertSeen.run(row.repo, row.number, row.comments ?? 0, now);
  }) as (rows: readonly ClassifiedRow[], now: number) => void);

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

    notes() {
      const rows = selectNotes.all() as Array<{ repo: string; number: number; body: string }>;
      return new Map(rows.map((row) => [`${row.repo}#${row.number}`, row.body]));
    },

    setNote(repo, number, body, now) {
      const trimmed = body.trim();
      if (trimmed === "") deleteNote.run(repo, number);
      else upsertNote.run(repo, number, trimmed, now);
    },

    seenCounts() {
      const rows = selectSeen.all() as Array<{ repo: string; number: number; comments: number }>;
      return new Map(rows.map((row) => [`${row.repo}#${row.number}`, row.comments]));
    },

    recordFirstSeen(rows, now) {
      writeFirstSeen(rows, now);
    },

    markSeen(repo, number, comments, now) {
      upsertSeen.run(repo, number, comments, now);
    },
  };
}

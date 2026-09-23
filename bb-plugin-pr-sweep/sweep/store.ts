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
     failed_repos TEXT NOT NULL DEFAULT '[]',
     truncated INTEGER NOT NULL DEFAULT 0,
     last_error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS pr_threads (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     thread_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  // The flag the thread was started for, so the sweep can tell when that
  // particular piece of work is finished. Nullable: rows linked before this
  // column existed have no reason and are simply never auto-archived.
  `ALTER TABLE pr_threads ADD COLUMN reason TEXT`,
  `CREATE TABLE IF NOT EXISTS thread_scan (
     thread_id TEXT PRIMARY KEY,
     scanned_at INTEGER NOT NULL
   )`,
  // Keyed by thread, not by pull request: one pull request genuinely has
  // several threads over its life — a conflict thread, then a CI thread, then
  // a merge thread — and `pr_threads`, keyed (repo, number), could only ever
  // remember the newest. Every earlier thread silently stopped being linked
  // to anything, which is how three unarchived threads ended up on #5840 with
  // nothing recording what any of them was for.
  `CREATE TABLE IF NOT EXISTS pr_thread_links (
     thread_id TEXT PRIMARY KEY,
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     reason TEXT
   )`,
  // Carries over whatever the old table still held. `pr_threads` is left in
  // place: these statements are append-only, and a dropped table cannot be
  // consulted if this migration turns out to have lost something.
  `INSERT OR IGNORE INTO pr_thread_links (thread_id, repo, number, created_at, reason)
     SELECT thread_id, repo, number, created_at, reason FROM pr_threads`,
  // Repositories the sweep found but did not fetch, because no bb project on
  // this machine has their remote. Stored so the panel can say why it is
  // empty instead of reading as "you have no open pull requests".
  `ALTER TABLE meta ADD COLUMN skipped_repos TEXT NOT NULL DEFAULT '[]'`,
  // Every reason the thread was started for, as a JSON array, superseding the
  // single `reason`. One click starts one thread on all of a row's findings,
  // so the one flag that named the button was never the whole job — and a
  // thread archived when that flag cleared still had the rest of its list.
  `ALTER TABLE pr_thread_links ADD COLUMN reasons TEXT`,
  // Carries the old single reason over, so a thread linked before this column
  // existed keeps auto-archiving on the flag it was started for. It is the
  // right answer for those rows: they predate multi-reason prompts only in
  // what was recorded, and the flag is the best account of them there is.
  `UPDATE pr_thread_links SET reasons = json_array(reason)
     WHERE reasons IS NULL AND reason IS NOT NULL`,
];

export interface SweepMeta {
  sweptAt: number | null;
  failedRepos: string[];
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
  replaceRepoRows(repo: string, rows: ClassifiedRow[]): void;
  replaceAll(result: SweepResult): void;
  readRows(): ClassifiedRow[];
  readMeta(): SweepMeta;
  recordFailure(message: string): void;
  /**
   * Links from a checkout that predates gh-context, for the one-time move of
   * them into it: every pull request thread this sweep ever recorded, oldest
   * first. Empty once they have moved and the tables are gone.
   */
  legacyThreadLinks(): Array<{ repo: string; number: number; threadId: string; createdAt: number }>;
  /** Drops the legacy link and scan tables once gh-context holds their rows. */
  dropLegacyThreadLinks(): void;
}

export function createStore(db: DatabaseLike): Store {
  const deleteRepo = db.prepare(`DELETE FROM rows WHERE repo = ?`);
  const insertRow = db.prepare(`INSERT INTO rows (repo, number, payload) VALUES (?, ?, ?)`);
  const selectRows = db.prepare(`SELECT payload FROM rows`);
  const selectMeta = db.prepare(
    `SELECT swept_at, failed_repos, skipped_repos, truncated, last_error FROM meta WHERE id = 1`,
  );
  const upsertMeta = db.prepare(
    `INSERT INTO meta (id, swept_at, failed_repos, skipped_repos, truncated, last_error)
     VALUES (1, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       swept_at = excluded.swept_at,
       failed_repos = excluded.failed_repos,
       skipped_repos = excluded.skipped_repos,
       truncated = excluded.truncated,
       last_error = NULL`,
  );
  const upsertFailure = db.prepare(
    `INSERT INTO meta (id, swept_at, failed_repos, skipped_repos, truncated, last_error)
     VALUES (1, NULL, '[]', '[]', 0, ?)
     ON CONFLICT(id) DO UPDATE SET last_error = excluded.last_error`,
  );

  function hasTable(name: string): boolean {
    return (
      db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !==
      undefined
    );
  }

  const writeRepo = db.transaction(((repo: string, rows: ClassifiedRow[]) => {
    deleteRepo.run(repo);
    for (const row of rows) insertRow.run(row.repo, row.number, JSON.stringify(row));
  }) as (repo: string, rows: ClassifiedRow[]) => void);

  function readRows(): ClassifiedRow[] {
    return (selectRows.all() as Array<{ payload: string }>).map(
      (entry) => JSON.parse(entry.payload) as ClassifiedRow,
    );
  }

  return {
    replaceRepoRows(repo, rows) {
      writeRepo(repo, rows);
    },

    replaceAll(result) {
      const byRepo = new Map<string, ClassifiedRow[]>();
      for (const repo of result.repos) {
        if (!result.failedRepos.includes(repo)) byRepo.set(repo, []);
      }
      for (const row of result.rows) {
        byRepo.get(row.repo)?.push(row);
      }

      // Drop repositories that no longer appear at all, but keep the ones whose
      // detail call failed so a partial sweep never blanks their rows.
      const keep = new Set([...byRepo.keys(), ...result.failedRepos]);
      for (const repo of new Set(readRows().map((row) => row.repo))) {
        if (!keep.has(repo)) deleteRepo.run(repo);
      }
      for (const [repo, rows] of byRepo) writeRepo(repo, rows);

      upsertMeta.run(
        result.sweptAt,
        JSON.stringify(result.failedRepos),
        JSON.stringify(result.skippedRepos ?? []),
        result.truncated ? 1 : 0,
      );
    },

    readRows,

    readMeta() {
      const meta = selectMeta.get() as
        | {
            swept_at: number | null;
            failed_repos: string;
            skipped_repos: string;
            truncated: number;
            last_error: string | null;
          }
        | undefined;
      if (!meta) {
        return {
          sweptAt: null,
          failedRepos: [],
          skippedRepos: [],
          truncated: false,
          lastError: null,
        };
      }
      return {
        sweptAt: meta.swept_at,
        failedRepos: JSON.parse(meta.failed_repos) as string[],
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
      if (!hasTable("pr_thread_links")) return [];
      return (
        db
          .prepare(
            `SELECT repo, number, thread_id, created_at FROM pr_thread_links
             ORDER BY created_at, thread_id`,
          )
          .all() as Array<{ repo: string; number: number; thread_id: string; created_at: number }>
      ).map((row) => ({
        repo: row.repo,
        number: row.number,
        threadId: row.thread_id,
        createdAt: row.created_at,
      }));
    },

    dropLegacyThreadLinks() {
      db.exec(`DROP TABLE IF EXISTS pr_thread_links`);
      db.exec(`DROP TABLE IF EXISTS pr_threads`);
      db.exec(`DROP TABLE IF EXISTS thread_scan`);
    },
  };
}

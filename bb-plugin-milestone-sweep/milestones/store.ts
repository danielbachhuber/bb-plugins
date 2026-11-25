// The milestones each sync read, a row per milestone, and when the last sync
// ran. A sync replaces a repository's rows wholesale, so a milestone that
// closed is gone after the next sync, and a repository no longer listed is
// deleted with `finishSync`. The threads started from issue rows are kept
// until the thread is archived or deleted.
import type { StoredMilestone } from "./github.js";

/**
 * APPEND-ONLY. Statement index is the migration id. Never edit or reorder a
 * shipped statement; only push new ones.
 */
export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS milestones (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     payload TEXT NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  // One row per repository the last sync covered, including those with no
  // open milestones, so the page can say which those are.
  `CREATE TABLE IF NOT EXISTS repositories (
     repo TEXT PRIMARY KEY,
     error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     synced_at INTEGER,
     last_error TEXT
   )`,
  // The thread started from an issue's row. The repository is stored lower
  // case, since GitHub's spelling of it can change between syncs.
  `CREATE TABLE IF NOT EXISTS threads (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     thread_id TEXT NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
];

interface Statement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

export interface Database {
  prepare(sql: string): Statement;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
}

export interface RepositoryState {
  repo: string;
  /** Why the last sync could not read it; its milestones are the ones read before. */
  error: string | null;
}

export function createStore(db: Database) {
  const replaceRepo = db.transaction((repo: string, milestones: readonly StoredMilestone[]) => {
    db.prepare("DELETE FROM milestones WHERE lower(repo) = lower(?)").run(repo);
    const insert = db.prepare("INSERT INTO milestones (repo, number, payload) VALUES (?, ?, ?)");
    for (const milestone of milestones) insert.run(milestone.repo, milestone.number, JSON.stringify(milestone));
  });

  const finishSync = db.transaction((repositories: readonly RepositoryState[], at: number, error: string | null) => {
    db.prepare("DELETE FROM repositories").run();
    const insert = db.prepare("INSERT INTO repositories (repo, error) VALUES (?, ?)");
    for (const repository of repositories) insert.run(repository.repo, repository.error);
    // A repository that is no longer listed takes its milestones with it.
    const keep = new Set(repositories.map((repository) => repository.repo.toLowerCase()));
    const rows = db.prepare("SELECT DISTINCT repo FROM milestones").all() as Array<{ repo: string }>;
    for (const { repo } of rows) {
      if (!keep.has(repo.toLowerCase())) db.prepare("DELETE FROM milestones WHERE repo = ?").run(repo);
    }
    db.prepare(
      `INSERT INTO meta (id, synced_at, last_error) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET synced_at = excluded.synced_at, last_error = excluded.last_error`,
    ).run(at, error);
  });

  return {
    /** Replaces one repository's milestones with the ones just read. */
    replaceRepo(repo: string, milestones: readonly StoredMilestone[]): void {
      replaceRepo(repo, milestones);
    },

    /** Records which repositories the sync covered, and drops the rest. */
    finishSync(repositories: readonly RepositoryState[], at: number, error: string | null): void {
      finishSync(repositories, at, error);
    },

    /** A sync that failed before reading anything keeps the last good rows. */
    recordFailure(error: string): void {
      db.prepare(
        `INSERT INTO meta (id, synced_at, last_error) VALUES (1, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET last_error = excluded.last_error`,
      ).run(error);
    },

    readAll(): StoredMilestone[] {
      const rows = db.prepare("SELECT payload FROM milestones").all() as Array<{ payload: string }>;
      return rows.map((row) => JSON.parse(row.payload) as StoredMilestone);
    },

    readOne(repo: string, number: number): StoredMilestone | null {
      const row = db.prepare("SELECT payload FROM milestones WHERE lower(repo) = lower(?) AND number = ?").get(repo, number) as
        | { payload: string }
        | undefined;
      return row === undefined ? null : (JSON.parse(row.payload) as StoredMilestone);
    },

    /** Remembers the thread started from an issue's row, replacing any before it. */
    linkThread(repo: string, number: number, threadId: string): void {
      db.prepare(
        `INSERT INTO threads (repo, number, thread_id) VALUES (lower(?), ?, ?)
         ON CONFLICT(repo, number) DO UPDATE SET thread_id = excluded.thread_id`,
      ).run(repo, number, threadId);
    },

    /** The thread each issue's row started, by issue number. */
    threadsFor(repo: string): Map<number, string> {
      const rows = db.prepare("SELECT number, thread_id FROM threads WHERE repo = lower(?)").all(repo) as Array<{
        number: number;
        thread_id: string;
      }>;
      return new Map(rows.map((row) => [row.number, row.thread_id]));
    },

    /** Forgets an archived or deleted thread, so its row offers a new one. Returns how many rows it freed. */
    releaseThread(threadId: string): number {
      return Number((db.prepare("DELETE FROM threads WHERE thread_id = ?").run(threadId) as { changes?: number }).changes ?? 0);
    },

    /** Forgets every thread not in `live`, the threads bb still has unarchived. */
    releaseThreadsExcept(live: ReadonlySet<string>): number {
      const rows = db.prepare("SELECT thread_id FROM threads").all() as Array<{ thread_id: string }>;
      let released = 0;
      for (const { thread_id } of rows) if (!live.has(thread_id)) released += this.releaseThread(thread_id);
      return released;
    },

    readRepositories(): RepositoryState[] {
      return db.prepare("SELECT repo, error FROM repositories ORDER BY lower(repo)").all() as RepositoryState[];
    },

    readMeta(): { syncedAt: number | null; lastError: string | null } {
      const row = db.prepare("SELECT synced_at, last_error FROM meta WHERE id = 1").get() as
        | { synced_at: number | null; last_error: string | null }
        | undefined;
      return { syncedAt: row?.synced_at ?? null, lastError: row?.last_error ?? null };
    },
  };
}

export type MilestoneStore = ReturnType<typeof createStore>;

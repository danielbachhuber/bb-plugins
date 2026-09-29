import { sortRows, type IssueRow, type SweepResult } from "./types.js";

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
  `CREATE TABLE IF NOT EXISTS issue_threads (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     thread_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  `CREATE TABLE IF NOT EXISTS board_auto (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     status TEXT NOT NULL,
     applied_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  `CREATE TABLE IF NOT EXISTS thread_scan (
     thread_id TEXT PRIMARY KEY,
     scanned_at INTEGER NOT NULL
   )`,
  // Keyed by thread, not by issue: one issue genuinely has several threads,
  // and `issue_threads`, keyed (repo, number), could only ever remember the
  // newest. Every earlier thread silently stopped being linked to anything.
  `CREATE TABLE IF NOT EXISTS issue_thread_links (
     thread_id TEXT PRIMARY KEY,
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  // Carries over whatever the old table still held. `issue_threads` is left in
  // place: these statements are append-only, and a dropped table cannot be
  // consulted if this migration turns out to have lost something.
  `INSERT OR IGNORE INTO issue_thread_links (thread_id, repo, number, created_at)
     SELECT thread_id, repo, number, created_at FROM issue_threads`,
  // Repositories the sweep found but did not list, because no bb project on
  // this machine has their remote. Stored so the panel can say why it is empty
  // instead of reading as "nothing is assigned to you".
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
  // The comment count when an issue was last opened from the panel, so the
  // row can say how many are new since.
  `CREATE TABLE IF NOT EXISTS seen (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     comments INTEGER NOT NULL,
     seen_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  // When this plugin last moved an issue's board status, by hand or on its
  // own. A board move leaves GitHub's updatedAt alone, so staleness reads the
  // later of the two.
  `CREATE TABLE IF NOT EXISTS status_moves (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     moved_at INTEGER NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  // The automatic moves made before the table existed.
  `INSERT OR IGNORE INTO status_moves (repo, number, moved_at)
     SELECT repo, number, applied_at FROM board_auto`,
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
  /** Swaps the whole listing in one transaction. The sweep is all-or-nothing. */
  replaceAll(result: SweepResult): void;
  readRows(): IssueRow[];
  readMeta(): SweepMeta;
  /** Notes why a sweep failed, leaving the last good rows in place. */
  recordFailure(message: string): void;
  /**
   * Links from a checkout that predates gh-context, for the one-time move of
   * them into it: every issue thread this sweep ever recorded, oldest first.
   * Empty once they have moved and the tables are gone.
   */
  legacyThreadLinks(): Array<{ repo: string; number: number; threadId: string; createdAt: number }>;
  /** Drops the legacy link and scan tables once gh-context holds their rows. */
  dropLegacyThreadLinks(): void;
  /**
   * The last board status this plugin moved an issue to on its own, or null.
   *
   * The point is to move an issue at most once per target. Without it the
   * sweep would drag a card back to "In Review" every five minutes for as long
   * as the pull request stayed open, undoing any move made by hand.
   */
  autoAppliedStatus(repo: string, number: number): string | null;
  recordAutoStatus(repo: string, number: number, status: string, appliedAt: number): void;
  /**
   * Patches one row's board status in place, without a sweep.
   *
   * The board stays the source of truth; this only stops the panel from
   * contradicting a move it just made. A card dragged to "In Progress" that
   * still reads "Ready" until the next five-minute sweep looks like the click
   * failed, and invites a second one.
   *
   * Returns false when the row is not in the listing, which is how the caller
   * learns the patch went nowhere.
   */
  setRowStatus(repo: string, number: number, status: string): boolean;
  /** Every note, keyed `repo#number`. */
  notes(): Map<string, string>;
  /** Saves a note. Empty or blank text deletes it instead. */
  setNote(repo: string, number: number, body: string, now: number): void;
  /** The comment count each issue was last seen at, keyed `repo#number`. */
  seenCounts(): Map<string, number>;
  /**
   * Records the current count for every row not seen before, and leaves the
   * rest alone. Run on every sweep, so an issue is never "new" merely because
   * this is the first sweep to list it.
   */
  recordFirstSeen(rows: readonly IssueRow[], now: number): void;
  /** Records the count an issue has now, when it is opened from the panel. */
  markSeen(repo: string, number: number, comments: number, now: number): void;
  /** Records that this plugin just moved the issue's board status. */
  recordMove(repo: string, number: number, movedAt: number): void;
  /** When each issue was last moved from here, keyed `repo#number`. */
  moves(): Map<string, number>;
}

export function createStore(db: DatabaseLike): Store {
  const deleteRows = db.prepare(`DELETE FROM rows`);
  const insertRow = db.prepare(`INSERT INTO rows (repo, number, payload) VALUES (?, ?, ?)`);
  const selectRows = db.prepare(`SELECT payload FROM rows`);
  const selectRow = db.prepare(`SELECT payload FROM rows WHERE repo = ? AND number = ?`);
  const updateRow = db.prepare(`UPDATE rows SET payload = ? WHERE repo = ? AND number = ?`);
  const selectMeta = db.prepare(`SELECT swept_at, skipped_repos, truncated, last_error FROM meta WHERE id = 1`);
  const upsertMeta = db.prepare(
    `INSERT INTO meta (id, swept_at, skipped_repos, truncated, last_error)
     VALUES (1, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       swept_at = excluded.swept_at,
       skipped_repos = excluded.skipped_repos,
       truncated = excluded.truncated,
       last_error = NULL`,
  );
  function hasTable(name: string): boolean {
    return (
      db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !==
      undefined
    );
  }
  const selectAuto = db.prepare(`SELECT status FROM board_auto WHERE repo = ? AND number = ?`);
  const upsertAuto = db.prepare(
    `INSERT INTO board_auto (repo, number, status, applied_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo, number) DO UPDATE SET
       status = excluded.status,
       applied_at = excluded.applied_at`,
  );
  const upsertFailure = db.prepare(
    `INSERT INTO meta (id, swept_at, skipped_repos, truncated, last_error)
     VALUES (1, NULL, '[]', 0, ?)
     ON CONFLICT(id) DO UPDATE SET last_error = excluded.last_error`,
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
  const selectMoves = db.prepare(`SELECT repo, number, moved_at FROM status_moves`);
  const upsertMove = db.prepare(
    `INSERT INTO status_moves (repo, number, moved_at) VALUES (?, ?, ?)
     ON CONFLICT(repo, number) DO UPDATE SET moved_at = excluded.moved_at`,
  );
  const writeFirstSeen = db.transaction(((rows: readonly IssueRow[], now: number) => {
    for (const row of rows) insertSeen.run(row.repo, row.number, row.commentsCount, now);
  }) as (rows: readonly IssueRow[], now: number) => void);

  const writeAll = db.transaction(((result: SweepResult) => {
    deleteRows.run();
    for (const row of result.rows) insertRow.run(row.repo, row.number, JSON.stringify(row));
    upsertMeta.run(
      result.sweptAt,
      JSON.stringify(result.skippedRepos ?? []),
      result.truncated ? 1 : 0,
    );
  }) as (result: SweepResult) => void);

  return {
    replaceAll(result) {
      writeAll(result);
    },

    // Sorting on read rather than trusting insertion order: SQLite makes no
    // ordering promise without an ORDER BY, and the payload is opaque to it.
    readRows() {
      return sortRows(
        (selectRows.all() as Array<{ payload: string }>).map(
          (entry) => JSON.parse(entry.payload) as IssueRow,
        ),
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
      if (!hasTable("issue_thread_links")) return [];
      return (
        db
          .prepare(
            `SELECT repo, number, thread_id, created_at FROM issue_thread_links
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
      db.exec(`DROP TABLE IF EXISTS issue_thread_links`);
      db.exec(`DROP TABLE IF EXISTS issue_threads`);
      db.exec(`DROP TABLE IF EXISTS thread_scan`);
    },

    autoAppliedStatus(repo, number) {
      const row = selectAuto.get(repo, number) as { status: string } | undefined;
      return row?.status ?? null;
    },

    setRowStatus(repo, number, status) {
      const stored = selectRow.get(repo, number) as { payload: string } | undefined;
      if (!stored) return false;
      const row = JSON.parse(stored.payload) as IssueRow;
      if (row.boardStatus === status) return false;
      updateRow.run(JSON.stringify({ ...row, boardStatus: status }), repo, number);
      return true;
    },

    recordAutoStatus(repo, number, status, appliedAt) {
      upsertAuto.run(repo, number, status, appliedAt);
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

    recordMove(repo, number, movedAt) {
      upsertMove.run(repo, number, movedAt);
    },

    moves() {
      const rows = selectMoves.all() as Array<{ repo: string; number: number; moved_at: number }>;
      return new Map(rows.map((row) => [`${row.repo}#${row.number}`, row.moved_at]));
    },
  };
}

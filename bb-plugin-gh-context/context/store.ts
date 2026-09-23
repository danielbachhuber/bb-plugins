import type { IssueRef } from "./rules.js";

/**
 * APPEND-ONLY. Statement index is the migration id. Never edit or reorder a
 * shipped statement; only push new ones.
 */
export const MIGRATIONS = [
  // One row per reason a thread is linked to an item. `source` is part of the
  // key, so a thread a sweep started whose prompt also names the issue is
  // recorded twice, and "threads I started" never depends on how a prompt
  // happened to read.
  `CREATE TABLE IF NOT EXISTS thread_links (
     thread_id TEXT NOT NULL,
     repo TEXT NOT NULL,
     kind TEXT NOT NULL,
     number INTEGER NOT NULL,
     source TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (thread_id, repo, kind, number, source)
   )`,
  `CREATE INDEX IF NOT EXISTS thread_links_item ON thread_links (repo, kind, number)`,
  // A first prompt never changes, so it is read once per thread, ever.
  `CREATE TABLE IF NOT EXISTS prompt_scan (
     thread_id TEXT PRIMARY KEY,
     scanned_at INTEGER NOT NULL
   )`,
  // The pull request a prompt names became a link after the first threads had
  // been scanned for issues only. Scanning again is safe: links are inserted
  // or ignored.
  `DELETE FROM prompt_scan`,
];

export type ItemKind = "issue" | "pull";

/**
 * Why a link exists: `prompt` and `opening-line` are rules 1 and 2, `via-pr`
 * rule 3, and `spawned:<plugin>` / `adopted:<plugin>` are recorded by the
 * sweeps through the links bridge.
 */
export type LinkSource = string;

export interface Link {
  threadId: string;
  repo: string;
  kind: ItemKind;
  number: number;
  source: LinkSource;
  createdAt: number;
}

export interface ItemKey {
  repo: string;
  kind: ItemKind;
  number: number;
}

export interface ItemThreads extends ItemKey {
  threads: { threadId: string; source: LinkSource }[];
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
  link(link: Link): void;
  /** Every link for the thread, or only those recorded for one reason. */
  unlink(threadId: string, source?: LinkSource): void;
  /** Rule 3's links follow the pull request, so they are replaced as a set. */
  replaceViaPr(threadId: string, refs: readonly IssueRef[], now: number): void;
  itemsForThread(threadId: string): Link[];
  threadsForItems(items: readonly ItemKey[]): ItemThreads[];
  isScanned(threadId: string): boolean;
  markScanned(threadId: string, now: number): void;
  unscanned(threadIds: readonly string[]): string[];
  deleteThread(threadId: string): void;
}

interface LinkRow {
  thread_id: string;
  repo: string;
  kind: ItemKind;
  number: number;
  source: string;
  created_at: number;
}

function fromRow(row: LinkRow): Link {
  return {
    threadId: row.thread_id,
    repo: row.repo,
    kind: row.kind,
    number: row.number,
    source: row.source,
    createdAt: row.created_at,
  };
}

export function createStore(db: DatabaseLike): Store {
  const insertLink = db.prepare(
    `INSERT OR IGNORE INTO thread_links (thread_id, repo, kind, number, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const deleteSource = db.prepare(`DELETE FROM thread_links WHERE thread_id = ? AND source = ?`);
  const deleteLinks = db.prepare(`DELETE FROM thread_links WHERE thread_id = ?`);
  const deleteScan = db.prepare(`DELETE FROM prompt_scan WHERE thread_id = ?`);
  // Insertion order, so a thread's issues read in the order they were found.
  const selectForThread = db.prepare(
    `SELECT * FROM thread_links WHERE thread_id = ? ORDER BY rowid`,
  );
  const selectForItem = db.prepare(
    `SELECT thread_id, source FROM thread_links
     WHERE repo = ? AND kind = ? AND number = ? ORDER BY rowid`,
  );
  const selectScan = db.prepare(`SELECT 1 FROM prompt_scan WHERE thread_id = ?`);
  const upsertScan = db.prepare(
    `INSERT INTO prompt_scan (thread_id, scanned_at) VALUES (?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET scanned_at = excluded.scanned_at`,
  );

  function link(entry: Link): void {
    insertLink.run(
      entry.threadId,
      entry.repo.toLowerCase(),
      entry.kind,
      entry.number,
      entry.source,
      entry.createdAt,
    );
  }

  const replaceViaPr = db.transaction(
    (threadId: string, refs: readonly IssueRef[], now: number) => {
      deleteSource.run(threadId, "via-pr");
      for (const ref of refs) {
        link({ threadId, repo: ref.repo, kind: "issue", number: ref.number, source: "via-pr", createdAt: now });
      }
    },
  );

  const deleteThread = db.transaction((threadId: string) => {
    deleteLinks.run(threadId);
    deleteScan.run(threadId);
  });

  function isScanned(threadId: string): boolean {
    return selectScan.get(threadId) !== undefined;
  }

  return {
    link,
    unlink(threadId, source) {
      if (source === undefined) deleteLinks.run(threadId);
      else deleteSource.run(threadId, source);
    },
    replaceViaPr,
    itemsForThread(threadId) {
      return (selectForThread.all(threadId) as LinkRow[]).map(fromRow);
    },
    threadsForItems(items) {
      return items.map((item) => {
        const repo = item.repo.toLowerCase();
        const rows = selectForItem.all(repo, item.kind, item.number) as Pick<
          LinkRow,
          "thread_id" | "source"
        >[];
        return {
          repo,
          kind: item.kind,
          number: item.number,
          threads: rows.map((row) => ({ threadId: row.thread_id, source: row.source })),
        };
      });
    },
    isScanned,
    markScanned(threadId, now) {
      upsertScan.run(threadId, now);
    },
    unscanned(threadIds) {
      return threadIds.filter((threadId) => !isScanned(threadId));
    },
    deleteThread,
  };
}

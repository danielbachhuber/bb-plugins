// The plugin's SQLite tables: one grouping per thread, and the content of
// every changed file at the moment it was accepted.
import type Database from "better-sqlite3";
import type { FileState } from "./stale";
import { itemKey } from "./types";
import type { StoredGrouping } from "./view";

/** Append-only: bb.storage.migrate rejects an edited or reordered statement. */
export const MIGRATIONS = [
  `CREATE TABLE groupings (
    thread_id TEXT PRIMARY KEY,
    grouping_json TEXT NOT NULL,
    assignments_json TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    grouped_at TEXT NOT NULL
  )`,
  `CREATE TABLE snapshot_files (
    thread_id TEXT NOT NULL,
    path TEXT NOT NULL,
    hash TEXT,
    content TEXT,
    PRIMARY KEY (thread_id, path)
  )`,
  `CREATE TABLE viewed (
    thread_id TEXT NOT NULL,
    path TEXT NOT NULL,
    hash TEXT NOT NULL,
    PRIMARY KEY (thread_id, path)
  )`,
  // Marks move from files to hunks, so a file split across concerns is viewed one concern at a time.
  `DROP TABLE viewed`,
  `CREATE TABLE viewed_items (
    thread_id TEXT NOT NULL,
    path TEXT NOT NULL,
    idx INTEGER NOT NULL,
    hash TEXT NOT NULL,
    PRIMARY KEY (thread_id, path, idx)
  )`,
];

export interface Store {
  get(threadId: string): StoredGrouping | null;
  snapshot(threadId: string): Map<string, FileState>;
  put(threadId: string, stored: StoredGrouping, files: Map<string, FileState>): void;
  /** Each viewed item, by `path#index`, with the hash of its lines when it was marked. */
  viewed(threadId: string): Map<string, string>;
  /** Mark items viewed at their current hashes, or clear their marks. */
  setViewed(threadId: string, items: Array<{ path: string; index: number; hash: string }>, viewed: boolean): void;
}

interface GroupingRow {
  grouping_json: string;
  assignments_json: string;
  base_sha: string;
  head_sha: string;
  grouped_at: string;
}

export function createStore(db: Database.Database): Store {
  const selectGrouping = db.prepare<[string], GroupingRow>(
    "SELECT grouping_json, assignments_json, base_sha, head_sha, grouped_at FROM groupings WHERE thread_id = ?",
  );
  const selectFiles = db.prepare<[string], { path: string; hash: string | null; content: string | null }>(
    "SELECT path, hash, content FROM snapshot_files WHERE thread_id = ? ORDER BY path",
  );
  const upsertGrouping = db.prepare(
    `INSERT INTO groupings (thread_id, grouping_json, assignments_json, base_sha, head_sha, grouped_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET grouping_json = excluded.grouping_json,
       assignments_json = excluded.assignments_json, base_sha = excluded.base_sha,
       head_sha = excluded.head_sha, grouped_at = excluded.grouped_at`,
  );
  const deleteFiles = db.prepare("DELETE FROM snapshot_files WHERE thread_id = ?");
  const insertFile = db.prepare("INSERT INTO snapshot_files (thread_id, path, hash, content) VALUES (?, ?, ?, ?)");

  const selectViewed = db.prepare<[string], { path: string; idx: number; hash: string }>("SELECT path, idx, hash FROM viewed_items WHERE thread_id = ?");
  const upsertViewed = db.prepare(
    "INSERT INTO viewed_items (thread_id, path, idx, hash) VALUES (?, ?, ?, ?) ON CONFLICT(thread_id, path, idx) DO UPDATE SET hash = excluded.hash",
  );
  const deleteViewed = db.prepare("DELETE FROM viewed_items WHERE thread_id = ? AND path = ? AND idx = ?");
  const setViewed = db.transaction((threadId: string, items: Array<{ path: string; index: number; hash: string }>, viewed: boolean) => {
    for (const item of items) {
      if (viewed) upsertViewed.run(threadId, item.path, item.index, item.hash);
      else deleteViewed.run(threadId, item.path, item.index);
    }
  });

  const put = db.transaction((threadId: string, stored: StoredGrouping, files: Map<string, FileState>) => {
    upsertGrouping.run(
      threadId,
      JSON.stringify(stored.grouping),
      JSON.stringify(stored.assignments),
      stored.baseSha,
      stored.headSha,
      stored.groupedAt,
    );
    deleteFiles.run(threadId);
    for (const [path, state] of files) insertFile.run(threadId, path, state.hash, state.text);
  });

  return {
    get(threadId) {
      const row = selectGrouping.get(threadId);
      if (row === undefined) return null;
      return {
        grouping: JSON.parse(row.grouping_json),
        assignments: JSON.parse(row.assignments_json),
        baseSha: row.base_sha,
        headSha: row.head_sha,
        groupedAt: row.grouped_at,
      };
    },
    snapshot(threadId) {
      return new Map(selectFiles.all(threadId).map((row) => [row.path, { hash: row.hash, text: row.content }]));
    },
    put(threadId, stored, files) {
      put(threadId, stored, files);
    },
    viewed(threadId) {
      return new Map(selectViewed.all(threadId).map((row) => [itemKey(row.path, row.idx), row.hash]));
    },
    setViewed(threadId, items, viewed) {
      setViewed(threadId, items, viewed);
    },
  };
}

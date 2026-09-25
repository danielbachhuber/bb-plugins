// The last synced list, kept in the plugin's database so the page opens with
// data. Written whole after each sync; read on every page load.
import type { NowList, SourceStatus } from "./contract.js";
import type { Item } from "./types.js";

/**
 * APPEND-ONLY. Statement index is the migration id. Never edit or reorder a
 * shipped statement; only push new ones.
 */
export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS items (
     id TEXT PRIMARY KEY,
     source TEXT NOT NULL,
     position INTEGER NOT NULL,
     payload TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sync (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     synced_at TEXT NOT NULL,
     sources TEXT NOT NULL
   )`,
  // Kept apart from items, which each sync replaces wholesale. activity_at is
  // the item's activity when it was snoozed, so newer activity brings it back.
  `CREATE TABLE IF NOT EXISTS snoozes (
     item_id TEXT PRIMARY KEY,
     until TEXT NOT NULL,
     activity_at TEXT,
     snoozed_at TEXT NOT NULL
   )`,
  // The thread started from a row, so its button opens that thread rather than
  // starting a second. Released when the thread is archived or deleted.
  `CREATE TABLE IF NOT EXISTS item_threads (
     item_id TEXT PRIMARY KEY,
     thread_id TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  // Snoozing was removed.
  `DROP TABLE IF EXISTS snoozes`,
];

interface StatementLike {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

export interface DatabaseLike {
  prepare(sql: string): StatementLike;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
}

export interface Store {
  /** Replaces the stored list with this one, in its order. */
  replace(list: NowList): void;
  /** The stored list, or null before the first sync has finished. */
  read(): NowList | null;
  /** Takes one item out of the stored list, as archiving does before the next sync. */
  removeItem(id: string): void;
  /**
   * Puts an item back in the stored list at `position`, where it was before it
   * was removed, so an undo returns it to the same place.
   */
  restoreItem(item: Item, position: number): void;
  /** Where an item sits in the stored list, or -1. */
  positionOf(id: string): number;
  /** Item id to the thread started from it. */
  threads(): Map<string, string>;
  linkThread(itemId: string, threadId: string, now: Date): void;
  /** Forgets every row linked to this thread. Returns how many were. */
  releaseThread(threadId: string): number;
}

export function createStore(db: DatabaseLike): Store {
  const deleteItems = db.prepare(`DELETE FROM items`);
  const insertItem = db.prepare(`INSERT INTO items (id, source, position, payload) VALUES (?, ?, ?, ?)`);
  const upsertSync = db.prepare(
    `INSERT INTO sync (id, synced_at, sources) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET synced_at = excluded.synced_at, sources = excluded.sources`,
  );
  const selectItems = db.prepare(`SELECT payload FROM items ORDER BY position`);
  const selectSync = db.prepare(`SELECT synced_at, sources FROM sync WHERE id = 1`);
  const deleteItem = db.prepare(`DELETE FROM items WHERE id = ?`);
  const selectThreads = db.prepare(`SELECT item_id, thread_id FROM item_threads`);
  const upsertThread = db.prepare(
    `INSERT INTO item_threads (item_id, thread_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET thread_id = excluded.thread_id, created_at = excluded.created_at`,
  );
  const deleteThread = db.prepare(`DELETE FROM item_threads WHERE thread_id = ?`);

  const writeAll = db.transaction(((list: NowList) => {
    deleteItems.run();
    list.items.forEach((item, position) => {
      insertItem.run(item.id, item.source, position, JSON.stringify(item));
    });
    upsertSync.run(list.fetchedAt, JSON.stringify(list.sources));
  }) as (list: NowList) => void);

  function read(): NowList | null {
    const sync = selectSync.get() as { synced_at: string; sources: string } | undefined;
    if (sync === undefined) return null;
    const items = (selectItems.all() as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as Item);
    return { items, sources: JSON.parse(sync.sources) as SourceStatus[], fetchedAt: sync.synced_at };
  }

  return {
    replace(list) {
      writeAll(list);
    },
    read,
    removeItem(id) {
      deleteItem.run(id);
    },
    restoreItem(item, position) {
      const stored = read();
      if (stored === null) return;
      const items = stored.items.filter((kept) => kept.id !== item.id);
      items.splice(Math.min(Math.max(position, 0), items.length), 0, item);
      writeAll({ ...stored, items });
    },
    positionOf(id) {
      return read()?.items.findIndex((item) => item.id === id) ?? -1;
    },
    threads() {
      const rows = selectThreads.all() as Array<{ item_id: string; thread_id: string }>;
      return new Map(rows.map((row) => [row.item_id, row.thread_id]));
    },
    linkThread(itemId, threadId, now) {
      upsertThread.run(itemId, threadId, now.toISOString());
    },
    releaseThread(threadId) {
      const result = deleteThread.run(threadId) as { changes?: number };
      return result.changes ?? 0;
    },
  };
}

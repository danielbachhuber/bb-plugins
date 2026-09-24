// The last synced list, kept in the plugin's database so the page opens with
// data. Written whole after each sync; read on every page load.
import type { NextList, SourceStatus } from "./contract.js";
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
  replace(list: NextList): void;
  /** The stored list, or null before the first sync has finished. */
  read(): NextList | null;
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

  const writeAll = db.transaction(((list: NextList) => {
    deleteItems.run();
    list.items.forEach((item, position) => {
      insertItem.run(item.id, item.source, position, JSON.stringify(item));
    });
    upsertSync.run(list.fetchedAt, JSON.stringify(list.sources));
  }) as (list: NextList) => void);

  return {
    replace(list) {
      writeAll(list);
    },
    read() {
      const sync = selectSync.get() as { synced_at: string; sources: string } | undefined;
      if (sync === undefined) return null;
      const items = (selectItems.all() as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as Item);
      return { items, sources: JSON.parse(sync.sources) as SourceStatus[], fetchedAt: sync.synced_at };
    },
  };
}

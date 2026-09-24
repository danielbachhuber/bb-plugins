// The only module that touches SQLite. Thread Todos no longer writes items:
// Thread Overview owns them. What is left is the old table, kept so Thread
// Overview can import it once, and a record of when a thread last called
// `bb todo`, which says when this stub is safe to uninstall.

import type { Database } from "better-sqlite3";
import type { Todo } from "./types.js";

export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS todos (
     id TEXT PRIMARY KEY,
     threadId TEXT NOT NULL,
     text TEXT NOT NULL,
     status TEXT NOT NULL,
     source TEXT NOT NULL,
     position INTEGER NOT NULL,
     createdAt INTEGER NOT NULL,
     updatedAt INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS todos_thread ON todos (threadId, position)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

type Row = Omit<Todo, "status" | "source"> & { status: string; source: string };

function toTodo(row: Row): Todo {
  return {
    ...row,
    status: row.status === "done" ? "done" : "open",
    source: row.source === "user" ? "user" : "agent",
  };
}

export type LastUsed = { at: number; threadId: string; via: string };

const LAST_USED_KEY = "last-used";

export class TodoStore {
  private readonly db: Database;
  private readonly now: () => number;

  constructor(db: Database, options: { now?: () => number } = {}) {
    this.db = db;
    this.now = options.now ?? (() => Date.now());
  }

  /** Every item on every thread, for Thread Overview's one-time import. */
  all(): Todo[] {
    const rows = this.db
      .prepare(`SELECT * FROM todos ORDER BY threadId, position`)
      .all() as Row[];
    return rows.map(toTodo);
  }

  /** Record a forwarded call. `via` is the CLI verb or the tool name. */
  markUsed(threadId: string, via: string): void {
    const value: LastUsed = { at: this.now(), threadId, via };
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      )
      .run(LAST_USED_KEY, JSON.stringify(value));
  }

  lastUsed(): LastUsed | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(LAST_USED_KEY) as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as LastUsed) : null;
  }
}

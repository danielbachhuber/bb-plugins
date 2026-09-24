// The only module that touches SQLite. What it decides, it decides by calling
// into steps.ts with rows it just read, so the behaviour stays testable
// without a database.

import type { Database } from "better-sqlite3";
import { newTexts, normalizeSummary, resolveRefs, statusChanges } from "./steps.js";
import type { Overview, Step, StepSource, StepStatus } from "./types.js";

/**
 * There is no statement here that removes a step on the agent's behalf.
 * `removeStep` exists for the band, and only for steps you added.
 */
export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS overviews (
     threadId TEXT PRIMARY KEY,
     summary TEXT NOT NULL DEFAULT '',
     updatedAt INTEGER NOT NULL DEFAULT 0,
     agentUpdatedAt INTEGER NOT NULL DEFAULT 0,
     seenAt INTEGER NOT NULL DEFAULT 0,
     collapsed INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS steps (
     id TEXT PRIMARY KEY,
     threadId TEXT NOT NULL,
     text TEXT NOT NULL,
     status TEXT NOT NULL,
     source TEXT NOT NULL,
     position INTEGER NOT NULL,
     createdAt INTEGER NOT NULL,
     updatedAt INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS steps_thread ON steps (threadId, position)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // The band starts collapsed. Its open state is now your choice alone, so the
  // columns that reopened it after an agent change go.
  `ALTER TABLE overviews ADD COLUMN expanded INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE overviews DROP COLUMN collapsed`,
  `ALTER TABLE overviews DROP COLUMN seenAt`,
  `ALTER TABLE overviews DROP COLUMN agentUpdatedAt`,
];

type StepRow = Omit<Step, "status" | "source"> & { status: string; source: string };

type OverviewRow = {
  threadId: string;
  summary: string;
  updatedAt: number;
  expanded: number;
};

function toStep(row: StepRow): Step {
  const status: StepStatus =
    row.status === "done" ? "done" : row.status === "current" ? "current" : "todo";
  return { ...row, status, source: row.source === "user" ? "user" : "agent" };
}

/**
 * `now` is injected so tests can assert timestamps, and `newId` so ids are
 * predictable in them. Both default to the real thing.
 */
export type StoreOptions = {
  now?: () => number;
  newId?: () => string;
};

export class OverviewStore {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(db: Database, options: StoreOptions = {}) {
    this.db = db;
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? (() => crypto.randomUUID().slice(0, 8));
  }

  steps(threadId: string): Step[] {
    const rows = this.db
      .prepare(`SELECT * FROM steps WHERE threadId = ? ORDER BY position`)
      .all(threadId) as StepRow[];
    return rows.map(toStep);
  }

  get(threadId: string): Overview {
    const row = this.db
      .prepare(`SELECT * FROM overviews WHERE threadId = ?`)
      .get(threadId) as OverviewRow | undefined;
    return {
      threadId,
      summary: row?.summary ?? "",
      steps: this.steps(threadId),
      updatedAt: row?.updatedAt ?? 0,
      expanded: (row?.expanded ?? 0) === 1,
    };
  }

  /** Record a change, by anyone, for "updated 12 min ago". */
  private touch(threadId: string, at: number): void {
    this.db
      .prepare(
        `INSERT INTO overviews (threadId, updatedAt) VALUES (?, ?)
         ON CONFLICT (threadId) DO UPDATE SET updatedAt = excluded.updatedAt`,
      )
      .run(threadId, at);
  }

  /** Set or replace the summary. Returns false when nothing changed. */
  setSummary(threadId: string, raw: string, source: StepSource): boolean {
    const summary = normalizeSummary(raw);
    if (summary === this.get(threadId).summary) return false;
    const at = this.now();
    this.db.transaction(() => {
      this.touch(threadId, at);
      this.db.prepare(`UPDATE overviews SET summary = ? WHERE threadId = ?`).run(summary, threadId);
    })();
    return true;
  }

  /**
   * Append the proposed steps not already open on this thread. Returns what
   * was created, which is what the agent needs to hear: deduping silently
   * leads it to re-add forever.
   */
  addSteps(threadId: string, texts: readonly string[], source: StepSource): Step[] {
    const existing = this.steps(threadId);
    const fresh = newTexts(existing, texts);
    if (fresh.length === 0) return [];

    const at = this.now();
    let position = existing.reduce((max, step) => Math.max(max, step.position), 0);
    const created: Step[] = fresh.map((text) => {
      position += 1;
      return {
        id: this.newId(),
        threadId,
        text,
        status: "todo" as const,
        source,
        position,
        createdAt: at,
        updatedAt: at,
      };
    });
    this.insertSteps(created);
    this.touch(threadId, at);
    return created;
  }

  private insertSteps(steps: readonly Step[]): number {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO steps (id, threadId, text, status, source, position, createdAt, updatedAt)
       VALUES (@id, @threadId, @text, @status, @source, @position, @createdAt, @updatedAt)`,
    );
    let inserted = 0;
    this.db.transaction((items: readonly Step[]) => {
      for (const item of items) inserted += insert.run(item).changes;
    })(steps);
    return inserted;
  }

  /**
   * Move steps to `status`. `refs` are ids or step text, see `resolveRefs`.
   * Unmatched references come back rather than throwing, so the agent can
   * correct itself against the overview handed back in the same result.
   */
  setStatus(
    threadId: string,
    refs: readonly string[],
    status: StepStatus,
    source: StepSource,
  ): { changed: Step[]; unmatched: string[] } {
    const steps = this.steps(threadId);
    const { matched, unmatched } = resolveRefs(steps, refs);
    const changes = statusChanges(steps, matched, status);
    if (changes.length > 0) {
      const at = this.now();
      const update = this.db.prepare(
        `UPDATE steps SET status = ?, updatedAt = ? WHERE id = ? AND threadId = ?`,
      );
      this.db.transaction(() => {
        for (const change of changes) update.run(change.status, at, change.id, threadId);
        this.touch(threadId, at);
      })();
    }
    const changedIds = new Set(changes.map((change) => change.id));
    return {
      changed: this.steps(threadId).filter((step) => changedIds.has(step.id)),
      unmatched,
    };
  }

  /** Band-only, and only for a step you added. The agent has no path here. */
  removeStep(threadId: string, id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM steps WHERE id = ? AND threadId = ? AND source = 'user'`)
      .run(id, threadId);
    if (result.changes > 0) this.touch(threadId, this.now());
    return result.changes > 0;
  }

  /** Whether you opened this thread's band. It is yours alone, so no change is recorded. */
  setExpanded(threadId: string, expanded: boolean): void {
    this.db
      .prepare(
        `INSERT INTO overviews (threadId, expanded) VALUES (?, ?)
         ON CONFLICT (threadId) DO UPDATE SET expanded = excluded.expanded`,
      )
      .run(threadId, expanded ? 1 : 0);
  }

  /** Called when bb says a thread is gone. */
  dropThread(threadId: string): number {
    return this.db.transaction(() => {
      this.db.prepare(`DELETE FROM overviews WHERE threadId = ?`).run(threadId);
      return this.db.prepare(`DELETE FROM steps WHERE threadId = ?`).run(threadId).changes;
    })();
  }

  /**
   * Copy steps in from elsewhere, keeping their ids, order, and times. A step
   * whose id is already here is skipped, so a repeated import adds nothing.
   * On a thread that already has steps, the imported ones go after them, so
   * the two plans do not interleave. Each thread's `updatedAt` becomes its
   * newest step's.
   */
  importSteps(steps: readonly Step[]): { steps: number; threads: number } {
    return this.db.transaction(() => {
      const offsets = new Map<string, number>();
      const offsetFor = (threadId: string) => {
        let offset = offsets.get(threadId);
        if (offset === undefined) {
          const row = this.db
            .prepare(`SELECT MAX(position) AS max FROM steps WHERE threadId = ?`)
            .get(threadId) as { max: number | null };
          offset = row.max ?? 0;
          offsets.set(threadId, offset);
        }
        return offset;
      };
      const known = this.db.prepare(`SELECT 1 FROM steps WHERE id = ?`);
      const fresh = steps
        .filter((step) => known.get(step.id) === undefined)
        .map((step) => ({ ...step, position: offsetFor(step.threadId) + step.position }));
      const inserted = this.insertSteps(fresh);
      const newest = new Map<string, number>();
      for (const step of steps) {
        newest.set(step.threadId, Math.max(newest.get(step.threadId) ?? 0, step.updatedAt));
      }
      const upsert = this.db.prepare(
        `INSERT INTO overviews (threadId, updatedAt) VALUES (?, ?)
         ON CONFLICT (threadId) DO UPDATE SET updatedAt = MAX(updatedAt, excluded.updatedAt)`,
      );
      for (const [threadId, at] of newest) upsert.run(threadId, at);
      return { steps: inserted, threads: newest.size };
    })();
  }

  meta(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
      .run(key, value);
  }
}

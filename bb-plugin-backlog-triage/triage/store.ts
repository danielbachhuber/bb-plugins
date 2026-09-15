/**
 * Persistence for the triage pass.
 *
 * Issue facts and triage decisions live in separate tables on purpose. A sweep
 * replaces everything in `issues`, so anything it wrote over would be lost on
 * the next refresh; suggestions and dispositions are the expensive, human part
 * of a pass and are only ever written by the CLI and the panel.
 */

import type { Database } from 'better-sqlite3';

import { rankRows } from './classify.js';
import { PENDING_DISPOSITION, type Disposition, type Suggestion, type TriageRow } from './types.js';

/**
 * APPEND-ONLY. Statement index is the migration id. Never edit or reorder a
 * shipped statement; only push new ones.
 */
export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS issues (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     payload TEXT NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  `CREATE TABLE IF NOT EXISTS triage (
     repo TEXT NOT NULL,
     number INTEGER NOT NULL,
     suggestion TEXT,
     disposition TEXT NOT NULL,
     PRIMARY KEY (repo, number)
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     repo TEXT PRIMARY KEY,
     swept_at INTEGER,
     total INTEGER NOT NULL DEFAULT 0,
     truncated INTEGER NOT NULL DEFAULT 0,
     last_error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS batches (
     thread_id TEXT PRIMARY KEY,
     repo TEXT NOT NULL,
     numbers TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  // The repo being triaged. Persisted rather than held in the panel so the
  // header and the table agree, and so a pass resumes where it left off.
  `CREATE TABLE IF NOT EXISTS selection (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     repo TEXT
   )`,
];

export interface RepoMeta {
  repo: string;
  sweptAt: number | null;
  total: number;
  truncated: boolean;
  lastError: string | null;
}

/** Row facts as stored, before triage state is merged back in. */
type StoredFacts = Omit<TriageRow, 'suggestion' | 'disposition'>;

export interface TriageStore {
  /** Replaces the fact rows for a repo, leaving triage state untouched. */
  replaceIssues(repo: string, rows: TriageRow[]): void;
  listRows(repo: string): TriageRow[];
  getRow(repo: string, number: number): TriageRow | null;
  putSuggestion(repo: string, number: number, suggestion: Suggestion): void;
  putDisposition(repo: string, number: number, disposition: Disposition): void;
  recordBatch(threadId: string, repo: string, numbers: number[]): void;
  batchNumbers(threadId: string): { repo: string; numbers: number[] } | null;
  setMeta(meta: RepoMeta): void;
  selectRepo(repo: string | null): void;
  selectedRepo(): string | null;
  getMeta(repo: string): RepoMeta | null;
  listRepos(): string[];
}

export function createStore(db: Database): TriageStore {
  function readTriage(repo: string, number: number): { suggestion: Suggestion | null; disposition: Disposition } {
    const row = db.prepare('SELECT suggestion, disposition FROM triage WHERE repo = ? AND number = ?').get(repo, number) as
      | { suggestion: string | null; disposition: string }
      | undefined;
    if (!row) return { suggestion: null, disposition: { ...PENDING_DISPOSITION } };
    return {
      suggestion: row.suggestion ? (JSON.parse(row.suggestion) as Suggestion) : null,
      disposition: JSON.parse(row.disposition) as Disposition,
    };
  }

  function upsertTriage(repo: string, number: number, patch: Partial<{ suggestion: Suggestion | null; disposition: Disposition }>): void {
    const current = readTriage(repo, number);
    const next = { ...current, ...patch };
    db.prepare(
      `INSERT INTO triage (repo, number, suggestion, disposition) VALUES (?, ?, ?, ?)
       ON CONFLICT(repo, number) DO UPDATE SET suggestion = excluded.suggestion, disposition = excluded.disposition`,
    ).run(repo, number, next.suggestion ? JSON.stringify(next.suggestion) : null, JSON.stringify(next.disposition));
  }

  return {
    replaceIssues(repo, rows) {
      const write = db.transaction((items: TriageRow[]) => {
        db.prepare('DELETE FROM issues WHERE repo = ?').run(repo);
        const insert = db.prepare('INSERT INTO issues (repo, number, payload) VALUES (?, ?, ?)');
        for (const row of items) {
          const { suggestion: _s, disposition: _d, ...facts } = row;
          insert.run(repo, row.number, JSON.stringify(facts));
        }
      });
      write(rows);
    },

    listRows(repo) {
      const facts = db.prepare('SELECT payload FROM issues WHERE repo = ?').all(repo) as { payload: string }[];
      const rows = facts.map((f) => {
        const parsed = JSON.parse(f.payload) as StoredFacts;
        return { ...parsed, ...readTriage(repo, parsed.number) };
      });
      return rankRows(rows);
    },

    getRow(repo, number) {
      const found = db.prepare('SELECT payload FROM issues WHERE repo = ? AND number = ?').get(repo, number) as
        | { payload: string }
        | undefined;
      if (!found) return null;
      const parsed = JSON.parse(found.payload) as StoredFacts;
      return { ...parsed, ...readTriage(repo, number) };
    },

    putSuggestion(repo, number, suggestion) {
      upsertTriage(repo, number, { suggestion });
    },

    putDisposition(repo, number, disposition) {
      upsertTriage(repo, number, { disposition });
    },

    recordBatch(threadId, repo, numbers) {
      db.prepare(
        `INSERT INTO batches (thread_id, repo, numbers, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET repo = excluded.repo, numbers = excluded.numbers`,
      ).run(threadId, repo, JSON.stringify(numbers), Date.now());
    },

    batchNumbers(threadId) {
      const row = db.prepare('SELECT repo, numbers FROM batches WHERE thread_id = ?').get(threadId) as
        | { repo: string; numbers: string }
        | undefined;
      if (!row) return null;
      return { repo: row.repo, numbers: JSON.parse(row.numbers) as number[] };
    },

    setMeta(meta) {
      db.prepare(
        `INSERT INTO meta (repo, swept_at, total, truncated, last_error) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(repo) DO UPDATE SET swept_at = excluded.swept_at, total = excluded.total,
           truncated = excluded.truncated, last_error = excluded.last_error`,
      ).run(meta.repo, meta.sweptAt, meta.total, meta.truncated ? 1 : 0, meta.lastError);
    },

    getMeta(repo) {
      const row = db.prepare('SELECT * FROM meta WHERE repo = ?').get(repo) as
        | { repo: string; swept_at: number | null; total: number; truncated: number; last_error: string | null }
        | undefined;
      if (!row) return null;
      return {
        repo: row.repo,
        sweptAt: row.swept_at,
        total: row.total,
        truncated: row.truncated === 1,
        lastError: row.last_error,
      };
    },

    selectRepo(repo) {
      db.prepare(`INSERT INTO selection (id, repo) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET repo = excluded.repo`).run(repo);
    },

    selectedRepo() {
      const row = db.prepare('SELECT repo FROM selection WHERE id = 1').get() as { repo: string | null } | undefined;
      return row?.repo ?? null;
    },

    listRepos() {
      const rows = db.prepare('SELECT repo FROM meta ORDER BY repo').all() as { repo: string }[];
      return rows.map((r) => r.repo);
    },
  };
}

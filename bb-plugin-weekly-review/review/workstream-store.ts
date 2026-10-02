/**
 * Workstreams, their rules, manual assignments, and each week's additions and
 * hidden rows, in the plugin's database. No network or bb API here.
 */
import type { Database } from "better-sqlite3";
import type { Rule, RuleType, WeekChoice, Workstream } from "./workstreams.js";

export const WORKSTREAM_MIGRATIONS = [
  `CREATE TABLE workstreams (
     id         INTEGER PRIMARY KEY,
     name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
     created_at TEXT NOT NULL,
     retired_at TEXT
   )`,
  `CREATE TABLE rules (
     id            INTEGER PRIMARY KEY,
     workstream_id INTEGER NOT NULL REFERENCES workstreams(id),
     type          TEXT NOT NULL,
     value         TEXT NOT NULL COLLATE NOCASE,
     created_at    TEXT NOT NULL,
     UNIQUE (type, value)
   )`,
  `CREATE TABLE assignments (
     item_key      TEXT PRIMARY KEY,
     workstream_id INTEGER,
     assigned_at   TEXT NOT NULL
   )`,
  `CREATE TABLE week_workstreams (
     monday        TEXT NOT NULL,
     workstream_id INTEGER NOT NULL,
     state         TEXT NOT NULL,
     PRIMARY KEY (monday, workstream_id)
   )`,
];

export interface WorkstreamStore {
  workstreams(): Workstream[];
  find(nameOrId: string): Workstream | null;
  /** Returns the existing workstream when the name is already taken. */
  create(name: string, at: string): Workstream;
  rename(id: number, name: string): void;
  retire(id: number, at: string): void;
  rules(): Rule[];
  /** Fails when the same type and value already point at a workstream. */
  addRule(workstreamId: number, type: RuleType, value: string, at: string): Rule;
  removeRule(id: number): boolean;
  assignments(): Map<string, number | null>;
  assign(key: string, workstreamId: number | null, at: string): void;
  unassign(key: string): void;
  choices(monday: string): Map<number, WeekChoice>;
  setChoice(monday: string, workstreamId: number, choice: WeekChoice | null): void;
}

interface RawWorkstream {
  id: number;
  name: string;
  retired_at: string | null;
}

interface RawRule {
  id: number;
  workstream_id: number;
  type: RuleType;
  value: string;
}

export function createWorkstreamStore(db: Database): WorkstreamStore {
  const statements = {
    all: db.prepare("SELECT id, name, retired_at FROM workstreams ORDER BY name COLLATE NOCASE"),
    byName: db.prepare("SELECT id, name, retired_at FROM workstreams WHERE name = ?"),
    byId: db.prepare("SELECT id, name, retired_at FROM workstreams WHERE id = ?"),
    create: db.prepare("INSERT INTO workstreams (name, created_at) VALUES (?, ?)"),
    rename: db.prepare("UPDATE workstreams SET name = ? WHERE id = ?"),
    retire: db.prepare("UPDATE workstreams SET retired_at = ? WHERE id = ?"),
    rules: db.prepare("SELECT id, workstream_id, type, value FROM rules ORDER BY id"),
    addRule: db.prepare(
      "INSERT INTO rules (workstream_id, type, value, created_at) VALUES (?, ?, ?, ?)",
    ),
    removeRule: db.prepare("DELETE FROM rules WHERE id = ?"),
    assignments: db.prepare("SELECT item_key, workstream_id FROM assignments"),
    assign: db.prepare(
      `INSERT INTO assignments (item_key, workstream_id, assigned_at) VALUES (?, ?, ?)
       ON CONFLICT (item_key) DO UPDATE SET
         workstream_id = excluded.workstream_id,
         assigned_at = excluded.assigned_at`,
    ),
    unassign: db.prepare("DELETE FROM assignments WHERE item_key = ?"),
    choices: db.prepare("SELECT workstream_id, state FROM week_workstreams WHERE monday = ?"),
    setChoice: db.prepare(
      `INSERT INTO week_workstreams (monday, workstream_id, state) VALUES (?, ?, ?)
       ON CONFLICT (monday, workstream_id) DO UPDATE SET state = excluded.state`,
    ),
    clearChoice: db.prepare("DELETE FROM week_workstreams WHERE monday = ? AND workstream_id = ?"),
  };

  const toWorkstream = (raw: RawWorkstream): Workstream => ({
    id: raw.id,
    name: raw.name,
    retiredAt: raw.retired_at,
  });

  return {
    workstreams() {
      return (statements.all.all() as RawWorkstream[]).map(toWorkstream);
    },
    find(nameOrId) {
      const needle = nameOrId.trim();
      const raw = (/^\d+$/.test(needle) ? statements.byId.get(Number(needle)) : undefined)
        ?? statements.byName.get(needle);
      return raw === undefined ? null : toWorkstream(raw as RawWorkstream);
    },
    create(name, at) {
      const trimmed = name.trim();
      if (trimmed === "") throw new Error("A workstream needs a name.");
      const existing = statements.byName.get(trimmed) as RawWorkstream | undefined;
      if (existing !== undefined) return toWorkstream(existing);
      const id = Number(statements.create.run(trimmed, at).lastInsertRowid);
      return { id, name: trimmed, retiredAt: null };
    },
    rename(id, name) {
      if (name.trim() === "") throw new Error("A workstream needs a name.");
      statements.rename.run(name.trim(), id);
    },
    retire(id, at) {
      statements.retire.run(at, id);
    },
    rules() {
      return (statements.rules.all() as RawRule[]).map((raw) => ({
        id: raw.id,
        workstreamId: raw.workstream_id,
        type: raw.type,
        value: raw.value,
      }));
    },
    addRule(workstreamId, type, value, at) {
      const trimmed = value.trim();
      if (trimmed === "") throw new Error("A rule needs a value.");
      try {
        const id = Number(statements.addRule.run(workstreamId, type, trimmed, at).lastInsertRowid);
        return { id, workstreamId, type, value: trimmed };
      } catch (error) {
        if (String(error).includes("UNIQUE")) {
          throw new Error(`A ${type} rule for "${trimmed}" already exists.`);
        }
        throw error;
      }
    },
    removeRule(id) {
      return statements.removeRule.run(id).changes > 0;
    },
    assignments() {
      const rows = statements.assignments.all() as Array<{
        item_key: string;
        workstream_id: number | null;
      }>;
      return new Map(rows.map((row) => [row.item_key, row.workstream_id]));
    },
    assign(key, workstreamId, at) {
      statements.assign.run(key, workstreamId, at);
    },
    unassign(key) {
      statements.unassign.run(key);
    },
    choices(monday) {
      const rows = statements.choices.all(monday) as Array<{
        workstream_id: number;
        state: WeekChoice;
      }>;
      return new Map(rows.map((row) => [row.workstream_id, row.state]));
    },
    setChoice(monday, workstreamId, choice) {
      if (choice === null) statements.clearChoice.run(monday, workstreamId);
      else statements.setChoice.run(monday, workstreamId, choice);
    },
  };
}

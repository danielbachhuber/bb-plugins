/**
 * Workstreams, their rules, manual assignments, and each week's additions and
 * hidden rows, in the plugin's database. No network or bb API here.
 */
import type { Database } from "better-sqlite3";
import type { RuleProposal } from "./priorities.js";
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
  // Which workstreams each of a week's priorities is about.
  `CREATE TABLE priority_links (
     monday        TEXT NOT NULL,
     priority      TEXT NOT NULL,
     workstream_id INTEGER NOT NULL,
     PRIMARY KEY (monday, priority, workstream_id)
   )`,
  `CREATE TABLE rule_proposals (
     id         INTEGER PRIMARY KEY,
     monday     TEXT NOT NULL,
     workstream TEXT NOT NULL,
     type       TEXT NOT NULL,
     value      TEXT NOT NULL,
     reason     TEXT NOT NULL,
     status     TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  // The journal doc as of its last good read, for when Google is slow.
  `CREATE TABLE journal_snapshot (
     id         INTEGER PRIMARY KEY CHECK (id = 1),
     text       TEXT NOT NULL,
     fetched_at TEXT NOT NULL
   )`,
];

export interface StoredProposal extends RuleProposal {
  id: number;
  status: "open" | "accepted" | "rejected";
}

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
  links(monday: string): Array<{ priority: string; workstreamId: number }>;
  link(monday: string, priority: string, workstreamId: number): void;
  unlink(monday: string, priority: string, workstreamId: number): void;
  /** The week's open proposals. */
  proposals(monday: string): StoredProposal[];
  proposal(id: number): StoredProposal | null;
  /** A new batch replaces the week's open proposals; decided ones stay as a record. */
  replaceProposals(monday: string, proposals: RuleProposal[], at: string): void;
  decide(id: number, status: "accepted" | "rejected"): void;
  journal(): { text: string; fetchedAt: string } | null;
  writeJournal(text: string, at: string): void;
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
    links: db.prepare("SELECT priority, workstream_id FROM priority_links WHERE monday = ?"),
    link: db.prepare(
      "INSERT OR IGNORE INTO priority_links (monday, priority, workstream_id) VALUES (?, ?, ?)",
    ),
    unlink: db.prepare(
      "DELETE FROM priority_links WHERE monday = ? AND priority = ? AND workstream_id = ?",
    ),
    proposals: db.prepare(
      "SELECT * FROM rule_proposals WHERE monday = ? AND status = 'open' ORDER BY id",
    ),
    proposal: db.prepare("SELECT * FROM rule_proposals WHERE id = ?"),
    clearOpen: db.prepare("DELETE FROM rule_proposals WHERE monday = ? AND status = 'open'"),
    propose: db.prepare(
      `INSERT INTO rule_proposals (monday, workstream, type, value, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    ),
    decide: db.prepare("UPDATE rule_proposals SET status = ? WHERE id = ?"),
    journal: db.prepare("SELECT text, fetched_at FROM journal_snapshot WHERE id = 1"),
    writeJournal: db.prepare(
      `INSERT INTO journal_snapshot (id, text, fetched_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET text = excluded.text, fetched_at = excluded.fetched_at`,
    ),
  };

  const toProposal = (raw: Record<string, unknown>): StoredProposal => ({
    id: raw.id as number,
    workstream: raw.workstream as string,
    type: raw.type as RuleType,
    value: raw.value as string,
    reason: raw.reason as string,
    status: raw.status as StoredProposal["status"],
  });

  const replaceProposals = db.transaction((monday: string, proposals: RuleProposal[], at: string) => {
    statements.clearOpen.run(monday);
    for (const proposal of proposals) {
      statements.propose.run(monday, proposal.workstream, proposal.type, proposal.value, proposal.reason, at);
    }
  });

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
    links(monday) {
      return (statements.links.all(monday) as Array<{ priority: string; workstream_id: number }>).map(
        (row) => ({ priority: row.priority, workstreamId: row.workstream_id }),
      );
    },
    link(monday, priority, workstreamId) {
      statements.link.run(monday, priority, workstreamId);
    },
    unlink(monday, priority, workstreamId) {
      statements.unlink.run(monday, priority, workstreamId);
    },
    proposals(monday) {
      return (statements.proposals.all(monday) as Array<Record<string, unknown>>).map(toProposal);
    },
    proposal(id) {
      const raw = statements.proposal.get(id) as Record<string, unknown> | undefined;
      return raw === undefined ? null : toProposal(raw);
    },
    replaceProposals(monday, proposals, at) {
      replaceProposals(monday, proposals, at);
    },
    decide(id, status) {
      statements.decide.run(status, id);
    },
    journal() {
      const row = statements.journal.get() as { text: string; fetched_at: string } | undefined;
      return row === undefined ? null : { text: row.text, fetchedAt: row.fetched_at };
    },
    writeJournal(text, at) {
      statements.writeJournal.run(text, at);
    },
  };
}

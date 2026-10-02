/**
 * Gathered weeks, in the plugin's database.
 *
 *   gathers        one row per run: when, why, and how each source fared
 *   items          one row per thing a source found, kept up to date by id
 *   doc_snapshots  the text of each reference doc, as of its last fetch
 *   agent_results  what the Slack, notes, and feedback agents recorded
 *
 * A week is read back into the `WeekData` shape the page and the digest have
 * always taken. A source that fails leaves its rows alone, so a broken
 * credential shows the last good data with the failure beside it rather than
 * an empty week.
 *
 * No network, filesystem, or bb API here, so it is tested against an
 * in-memory database.
 */
import type { Database } from "better-sqlite3";
import type { Feedback } from "./agents.js";
import { emptyData, fromItems, toItems, type ItemSource, type SourceData } from "./items.js";
import type {
  DocRef,
  ReflectNote,
  SlackThread,
  SourceResult,
  WeekData,
} from "./types.js";

/** Appended to the plugin's migrations, after the source definitions. */
export const WEEK_MIGRATIONS = [
  `CREATE TABLE gathers (
     id          INTEGER PRIMARY KEY,
     monday      TEXT NOT NULL,
     to_day      TEXT NOT NULL,
     trigger     TEXT NOT NULL,
     started_at  TEXT NOT NULL,
     finished_at TEXT,
     sources     TEXT NOT NULL DEFAULT '[]'
   )`,
  `CREATE INDEX gathers_by_monday ON gathers (monday, started_at)`,
  `CREATE TABLE items (
     source        TEXT NOT NULL,
     kind          TEXT NOT NULL,
     external_id   TEXT NOT NULL,
     monday        TEXT NOT NULL,
     position      INTEGER NOT NULL,
     day           TEXT,
     title         TEXT NOT NULL,
     url           TEXT,
     payload       TEXT NOT NULL,
     first_seen_at TEXT NOT NULL,
     last_seen_at  TEXT NOT NULL,
     removed_at    TEXT,
     PRIMARY KEY (source, kind, external_id, monday)
   )`,
  `CREATE TABLE doc_snapshots (
     monday     TEXT NOT NULL,
     doc_id     TEXT NOT NULL,
     position   INTEGER NOT NULL,
     label      TEXT NOT NULL,
     text       TEXT,
     error      TEXT,
     fetched_at TEXT NOT NULL,
     PRIMARY KEY (monday, doc_id)
   )`,
  `CREATE TABLE agent_results (
     monday      TEXT NOT NULL,
     kind        TEXT NOT NULL,
     payload     TEXT NOT NULL,
     recorded_at TEXT NOT NULL,
     PRIMARY KEY (monday, kind)
   )`,
];

export type GatherTrigger = "schedule" | "manual" | "import";

export interface SourceStatus {
  name: string;
  ok: boolean;
  error?: string;
  millis: number;
}

/** The name a source is reported under, which is also its key in `gathers.sources`. */
export const SOURCE_NAMES = {
  harvest: "Harvest",
  github: "GitHub",
  todoist: "Todoist",
  calendar: "Calendar",
  docs: "Docs",
} as const;

export interface GatherRow {
  id: number;
  monday: string;
  to: string;
  trigger: GatherTrigger;
  startedAt: string;
  finishedAt: string | null;
  sources: SourceStatus[];
}

/** A gathered week, reduced to what a chooser needs to label it. */
export interface WeekSummary {
  monday: string;
  to: string;
  generatedAt: string;
}

export interface DocSnapshot {
  id: string;
  label: string;
  text?: string;
  error?: string;
}

type AgentKind = "slack" | "reflect" | "feedback";

export interface WeekStore {
  startGather(monday: string, to: string, trigger: GatherTrigger, at: string): number;
  finishGather(id: number, sources: SourceStatus[], at: string): void;
  /** Upserts what a source returned, and marks the week's rows it did not return as removed. */
  writeItems<S extends ItemSource>(monday: string, source: S, data: SourceData[S], at: string): void;
  /**
   * Makes the week's doc snapshots match this fetch, in the order given. A doc
   * that failed keeps its previous text.
   */
  writeDocs(monday: string, docs: DocSnapshot[], at: string): void;
  docText(monday: string, docId: string): string | null;
  writeAgentResult(monday: string, kind: AgentKind, payload: unknown, at: string): void;
  readFeedback(monday: string): Feedback | null;
  readWeek(monday: string): WeekData | null;
  listWeeks(): WeekSummary[];
  /** Every gather, newest first, up to `limit`. */
  gathers(limit: number): GatherRow[];
  hasGathers(monday: string): boolean;
}

interface RawGather {
  id: number;
  monday: string;
  to_day: string;
  trigger: GatherTrigger;
  started_at: string;
  finished_at: string | null;
  sources: string;
}

export function createWeekStore(db: Database): WeekStore {
  const statements = {
    startGather: db.prepare(
      "INSERT INTO gathers (monday, to_day, trigger, started_at) VALUES (?, ?, ?, ?)",
    ),
    finishGather: db.prepare("UPDATE gathers SET finished_at = ?, sources = ? WHERE id = ?"),
    weekGathers: db.prepare(
      `SELECT * FROM gathers WHERE monday = ? AND finished_at IS NOT NULL
       ORDER BY started_at DESC, id DESC`,
    ),
    allGathers: db.prepare("SELECT * FROM gathers ORDER BY started_at DESC, id DESC LIMIT ?"),
    hasGathers: db.prepare("SELECT 1 FROM gathers WHERE monday = ? LIMIT 1"),
    listWeeks: db.prepare(
      `SELECT g.monday, g.to_day, g.finished_at FROM gathers g
       WHERE g.finished_at IS NOT NULL AND g.id = (
         SELECT id FROM gathers WHERE monday = g.monday AND finished_at IS NOT NULL
         ORDER BY started_at DESC, id DESC LIMIT 1
       )
       ORDER BY g.monday DESC`,
    ),
    upsertItem: db.prepare(
      `INSERT INTO items (source, kind, external_id, monday, position, day, title, url, payload,
                          first_seen_at, last_seen_at, removed_at)
       VALUES (@source, @kind, @externalId, @monday, @position, @day, @title, @url, @payload,
               @at, @at, NULL)
       ON CONFLICT (source, kind, external_id, monday) DO UPDATE SET
         position = excluded.position,
         day = excluded.day,
         title = excluded.title,
         url = excluded.url,
         payload = excluded.payload,
         last_seen_at = excluded.last_seen_at,
         removed_at = NULL`,
    ),
    // Run after the upserts: anything this run did not touch is no longer upstream.
    markRemoved: db.prepare(
      `UPDATE items SET removed_at = ?
       WHERE source = ? AND monday = ? AND removed_at IS NULL AND last_seen_at <> ?`,
    ),
    readItems: db.prepare(
      `SELECT kind, payload FROM items
       WHERE source = ? AND monday = ? AND removed_at IS NULL
       ORDER BY position`,
    ),
    // A doc that failed this time keeps the text it had, beside the new error.
    writeDoc: db.prepare(
      `INSERT INTO doc_snapshots (monday, doc_id, position, label, text, error, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (monday, doc_id) DO UPDATE SET
         position = excluded.position,
         label = excluded.label,
         text = COALESCE(excluded.text, doc_snapshots.text),
         error = excluded.error,
         fetched_at = excluded.fetched_at`,
    ),
    removeDoc: db.prepare("DELETE FROM doc_snapshots WHERE monday = ? AND doc_id = ?"),
    docIds: db.prepare("SELECT doc_id FROM doc_snapshots WHERE monday = ?"),
    readDocs: db.prepare(
      "SELECT doc_id, label, error FROM doc_snapshots WHERE monday = ? ORDER BY position",
    ),
    docText: db.prepare("SELECT text FROM doc_snapshots WHERE monday = ? AND doc_id = ?"),
    writeAgent: db.prepare(
      `INSERT INTO agent_results (monday, kind, payload, recorded_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (monday, kind) DO UPDATE SET
         payload = excluded.payload,
         recorded_at = excluded.recorded_at`,
    ),
    readAgent: db.prepare("SELECT payload FROM agent_results WHERE monday = ? AND kind = ?"),
  };

  const writeItems = db.transaction(
    (monday: string, source: ItemSource, data: SourceData[ItemSource], at: string) => {
      toItems(source, data).forEach((item, position) =>
        statements.upsertItem.run({
          source,
          kind: item.kind,
          externalId: item.externalId,
          monday,
          position,
          day: item.day,
          title: item.title,
          url: item.url,
          payload: JSON.stringify(item.payload),
          at,
        }),
      );
      statements.markRemoved.run(at, source, monday, at);
    },
  );

  const writeDocs = db.transaction((monday: string, docs: DocSnapshot[], at: string) => {
    const keep = new Set(docs.map((doc) => doc.id));
    for (const row of statements.docIds.all(monday) as Array<{ doc_id: string }>) {
      if (!keep.has(row.doc_id)) statements.removeDoc.run(monday, row.doc_id);
    }
    docs.forEach((doc, position) =>
      statements.writeDoc.run(
        monday, doc.id, position, doc.label, doc.text ?? null, doc.error ?? null, at,
      ),
    );
  });

  function readAgent<T>(monday: string, kind: AgentKind): T | null {
    const row = statements.readAgent.get(monday, kind) as { payload: string } | undefined;
    return row === undefined ? null : (JSON.parse(row.payload) as T);
  }

  return {
    startGather(monday, to, trigger, at) {
      return Number(statements.startGather.run(monday, to, trigger, at).lastInsertRowid);
    },
    finishGather(id, sources, at) {
      statements.finishGather.run(at, JSON.stringify(sources), id);
    },
    writeItems(monday, source, data, at) {
      writeItems(monday, source, data, at);
    },
    writeDocs(monday, docs, at) {
      writeDocs(monday, docs, at);
    },
    docText(monday, docId) {
      const row = statements.docText.get(monday, docId) as { text: string | null } | undefined;
      return row?.text ?? null;
    },
    writeAgentResult(monday, kind, payload, at) {
      statements.writeAgent.run(monday, kind, JSON.stringify(payload), at);
    },
    readFeedback(monday) {
      return readAgent<Feedback>(monday, "feedback");
    },

    readWeek(monday) {
      const gathers = (statements.weekGathers.all(monday) as RawGather[]).map(toGatherRow);
      const latest = gathers[0];
      if (latest === undefined) return null;

      const items = <S extends ItemSource>(source: S): SourceData[S] => {
        const rows = statements.readItems.all(source, monday) as Array<{
          kind: string;
          payload: string;
        }>;
        return fromItems(
          source,
          rows.map((row) => ({ kind: row.kind, payload: JSON.parse(row.payload) })),
        );
      };
      const status = (key: keyof typeof SOURCE_NAMES) =>
        sourceStatus(gathers, SOURCE_NAMES[key]);

      const docs = (statements.readDocs.all(monday) as Array<{
        doc_id: string;
        label: string;
        error: string | null;
      }>).map((row): DocRef => ({
        id: row.doc_id,
        label: row.label,
        url: `https://docs.google.com/document/d/${row.doc_id}/edit`,
        ...(row.error === null ? {} : { error: row.error }),
      }));

      const calendar = status("calendar");
      const slack = readAgent<SourceResult<SlackThread[]>>(monday, "slack");
      const reflect = readAgent<SourceResult<ReflectNote[]>>(monday, "reflect");

      // Optional keys are left absent rather than set to undefined: this goes
      // out over RPC, and an explicit undefined is not a JSON value.
      return {
        from: monday,
        to: latest.to,
        generatedAt: latest.finishedAt ?? latest.startedAt,
        harvest: withStatus(status("harvest"), items("harvest"), emptyData("harvest")),
        github: withStatus(status("github"), items("github"), emptyData("github")),
        todoist: withStatus(status("todoist"), items("todoist"), emptyData("todoist")),
        docs: withStatus(status("docs"), docs, []),
        ...(calendar === null ? {} : { calendar: withStatus(calendar, items("calendar"), []) }),
        ...(slack === null ? {} : { slack }),
        ...(reflect === null ? {} : { reflect }),
      };
    },

    listWeeks() {
      return (statements.listWeeks.all() as Array<{
        monday: string;
        to_day: string;
        finished_at: string;
      }>).map((row) => ({ monday: row.monday, to: row.to_day, generatedAt: row.finished_at }));
    },
    gathers(limit) {
      return (statements.allGathers.all(limit) as RawGather[]).map(toGatherRow);
    },
    hasGathers(monday) {
      return statements.hasGathers.get(monday) !== undefined;
    },
  };
}

function toGatherRow(raw: RawGather): GatherRow {
  return {
    id: raw.id,
    monday: raw.monday,
    to: raw.to_day,
    trigger: raw.trigger,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
    sources: JSON.parse(raw.sources) as SourceStatus[],
  };
}

/** How a source stands across a week's gathers, newest first. */
interface Standing {
  /** The latest gather that ran this source. */
  latest: { ok: boolean; error?: string; at: string };
  /** When it last succeeded, if it ever has. */
  lastOkAt: string | null;
}

export function sourceStatus(gathers: GatherRow[], name: string): Standing | null {
  let latest: Standing["latest"] | null = null;
  for (const gather of gathers) {
    const found = gather.sources.find((source) => source.name === name);
    if (found === undefined) continue;
    const at = gather.finishedAt ?? gather.startedAt;
    latest ??= { ok: found.ok, ...(found.error === undefined ? {} : { error: found.error }), at };
    if (found.ok) return { latest, lastOkAt: at };
  }
  return latest === null ? null : { latest, lastOkAt: null };
}

/**
 * A source's rows with its standing. A failed latest run keeps the rows of
 * the last good one, dated by when that was, with the failure as the error.
 */
function withStatus<T>(standing: Standing | null, data: T, empty: T): SourceResult<T> {
  if (standing === null) {
    return { ok: false, error: "Not gathered.", fetchedAt: new Date(0).toISOString(), data: empty };
  }
  const { latest, lastOkAt } = standing;
  return {
    ok: latest.ok,
    ...(latest.error === undefined ? {} : { error: latest.error }),
    fetchedAt: lastOkAt ?? latest.at,
    data: lastOkAt === null ? empty : data,
  };
}

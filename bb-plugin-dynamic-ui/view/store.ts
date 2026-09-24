/**
 * Published views and what the user did with each item, in the plugin's own
 * database.
 *
 * A view belongs to the thread that published it and is named by a key, so a
 * skill that publishes again under the same key replaces its view instead of
 * adding a second one. What the user did to an item is kept by item id, so it
 * survives the replacement.
 *
 * Views quote the user's own work, which is why they live in the database bb
 * keeps under its data directory and never in a file inside this checkout.
 */
import type { Database } from "better-sqlite3";
import type { Feedback } from "./review.js";
import type { View } from "./schema.js";

export const MIGRATIONS = [
  `CREATE TABLE views (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     thread_id    TEXT NOT NULL,
     key          TEXT NOT NULL,
     body         TEXT NOT NULL,
     cwd          TEXT,
     published_at TEXT NOT NULL,
     UNIQUE (thread_id, key)
   )`,
  `CREATE TABLE item_states (
     view_id    INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
     item_id    TEXT NOT NULL,
     state      TEXT NOT NULL,
     result     TEXT,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (view_id, item_id)
   )`,
  // A visual review's images, copied at publish so the review keeps showing
  // what was proposed.
  `CREATE TABLE images (
     view_id  INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
     item_id  TEXT NOT NULL,
     idx      INTEGER NOT NULL,
     mime     TEXT NOT NULL,
     data     BLOB NOT NULL,
     PRIMARY KEY (view_id, item_id, idx)
   )`,
];

export type ItemState = "open" | "done" | "dismissed";

/** What the last action on an item did, shown on its card. */
export interface ActionResult {
  label: string;
  at: string;
  /** A thread the action opened. */
  threadId?: string;
  /** A command's exit code and the tail of its output. */
  exitCode?: number;
  output?: string;
  error?: string;
  /** The user changed the text before sending it. */
  edited?: boolean;
  /** What a visual review sent back. */
  feedback?: Feedback;
}

export interface StoredImage {
  mime: string;
  data: Buffer;
}

export interface ItemRecord {
  state: ItemState;
  result: ActionResult | null;
}

export interface StoredView {
  id: number;
  threadId: string;
  key: string;
  view: View;
  /** Where `publish` ran, the default directory for command actions. */
  cwd: string | null;
  publishedAt: string;
  items: Record<string, ItemRecord>;
}

export interface Store {
  publish(threadId: string, key: string, view: View, cwd: string | null, now: string): StoredView;
  get(id: number): StoredView | null;
  forThread(threadId: string): StoredView[];
  setItem(viewId: number, itemId: string, record: ItemRecord, now: string): StoredView | null;
  /** Replaces every image a view holds, as one publish's set. */
  putImages(viewId: number, images: Array<{ itemId: string; index: number } & StoredImage>): void;
  image(viewId: number, itemId: string, index: number): StoredImage | null;
}

type ViewRow = {
  id: number;
  thread_id: string;
  key: string;
  body: string;
  cwd: string | null;
  published_at: string;
};

type StateRow = { item_id: string; state: ItemState; result: string | null };

export function createStore(db: Database): Store {
  function hydrate(row: ViewRow): StoredView {
    const view = JSON.parse(row.body) as View;
    const known = new Set(view.sections.flatMap((section) => section.items.map((item) => item.id)));
    const items: Record<string, ItemRecord> = {};
    for (const state of db
      .prepare("SELECT item_id, state, result FROM item_states WHERE view_id = ?")
      .all(row.id) as StateRow[]) {
      if (!known.has(state.item_id)) continue;
      items[state.item_id] = {
        state: state.state,
        result: state.result === null ? null : (JSON.parse(state.result) as ActionResult),
      };
    }
    return {
      id: row.id,
      threadId: row.thread_id,
      key: row.key,
      view,
      cwd: row.cwd,
      publishedAt: row.published_at,
      items,
    };
  }

  function get(id: number): StoredView | null {
    const row = db.prepare("SELECT * FROM views WHERE id = ?").get(id) as ViewRow | undefined;
    return row === undefined ? null : hydrate(row);
  }

  return {
    publish(threadId, key, view, cwd, now) {
      // An upsert keeps the row id, so item states and any open tab that
      // names the view by id carry over to the new version.
      db.prepare(
        `INSERT INTO views (thread_id, key, body, cwd, published_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (thread_id, key) DO UPDATE SET body = excluded.body, cwd = excluded.cwd,
           published_at = excluded.published_at`,
      ).run(threadId, key, JSON.stringify(view), cwd, now);
      const row = db
        .prepare("SELECT * FROM views WHERE thread_id = ? AND key = ?")
        .get(threadId, key) as ViewRow;
      return hydrate(row);
    },

    get,

    forThread(threadId) {
      return (
        db
          .prepare("SELECT * FROM views WHERE thread_id = ? ORDER BY published_at DESC, id DESC")
          .all(threadId) as ViewRow[]
      ).map(hydrate);
    },

    setItem(viewId, itemId, record, now) {
      if (get(viewId) === null) return null;
      db.prepare(
        `INSERT INTO item_states (view_id, item_id, state, result, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (view_id, item_id) DO UPDATE SET state = excluded.state,
           result = excluded.result, updated_at = excluded.updated_at`,
      ).run(viewId, itemId, record.state, record.result === null ? null : JSON.stringify(record.result), now);
      return get(viewId);
    },

    putImages(viewId, images) {
      const insert = db.prepare("INSERT INTO images (view_id, item_id, idx, mime, data) VALUES (?, ?, ?, ?, ?)");
      db.transaction(() => {
        db.prepare("DELETE FROM images WHERE view_id = ?").run(viewId);
        for (const image of images) insert.run(viewId, image.itemId, image.index, image.mime, image.data);
      })();
    },

    image(viewId, itemId, index) {
      const row = db
        .prepare("SELECT mime, data FROM images WHERE view_id = ? AND item_id = ? AND idx = ?")
        .get(viewId, itemId, index) as StoredImage | undefined;
      return row ?? null;
    },
  };
}

/** Where an item stands, for the CLI and the agent reading it back. */
export function describeItems(stored: StoredView): string[] {
  return stored.view.sections.flatMap((section) =>
    section.items.map((item) => {
      const record = stored.items[item.id];
      const state = record?.state ?? "open";
      const result = record?.result;
      const detail =
        result === null || result === undefined
          ? ""
          : `  (${result.label}${result.edited ? ", edited" : ""}${result.threadId === undefined ? "" : ` → ${result.threadId}`}${
              result.exitCode === undefined ? "" : `, exit ${result.exitCode}`
            }${result.error === undefined ? "" : `, failed: ${result.error}`}${
              result.feedback?.pick == null ? "" : `, picked ${item.variations[result.feedback.pick]?.label ?? result.feedback.pick}`
            })`;
      return `[${state}] ${item.id}  ${item.title}${detail}`;
    }),
  );
}

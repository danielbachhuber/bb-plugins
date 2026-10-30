import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { DAY_MS, expiredViews, isNotFound, type ThreadState } from "./cleanup.js";
import { parseView } from "./schema.js";
import { MIGRATIONS, createStore } from "./store.js";

const NOW = Date.UTC(2026, 9, 30);
const KEEP = 30 * DAY_MS;

function states(entries: Record<string, ThreadState>) {
  return new Map(Object.entries(entries));
}

describe("expiredViews", () => {
  it("deletes a view once its thread has been archived for the whole period", () => {
    const views = [
      { id: 1, threads: ["thr_old"] },
      { id: 2, threads: ["thr_recent"] },
      { id: 3, threads: ["thr_open"] },
    ];
    const found = states({
      thr_old: { archivedAt: NOW - KEEP },
      thr_recent: { archivedAt: NOW - KEEP + 1 },
      thr_open: { archivedAt: null },
    });
    expect(expiredViews(views, found, NOW, KEEP)).toEqual([1]);
  });

  it("deletes a view whose thread was deleted", () => {
    expect(expiredViews([{ id: 1, threads: ["thr_gone"] }], states({ thr_gone: "gone" }), NOW, KEEP)).toEqual([1]);
  });

  it("keeps a view while any thread its items name could still show it", () => {
    const views = [{ id: 1, threads: ["thr_old", "thr_open"] }];
    const found = states({ thr_old: { archivedAt: NOW - KEEP }, thr_open: { archivedAt: null } });
    expect(expiredViews(views, found, NOW, KEEP)).toEqual([]);
  });

  it("keeps a view when a lookup failed, so a bad request never deletes anything", () => {
    const views = [{ id: 1, threads: ["thr_gone", "thr_failed"] }];
    expect(expiredViews(views, states({ thr_gone: "gone", thr_failed: "unknown" }), NOW, KEEP)).toEqual([]);
    expect(expiredViews(views, states({ thr_gone: "gone" }), NOW, KEEP)).toEqual([]);
  });
});

describe("isNotFound", () => {
  it("tells a missing thread from a failed request", () => {
    expect(isNotFound(Object.assign(new Error("Thread not found"), { status: 404 }))).toBe(true);
    expect(isNotFound({ code: "not_found", message: "x" })).toBe(true);
    expect(isNotFound(new Error("HTTP 404: Thread not found"))).toBe(true);
    expect(isNotFound(new Error("fetch failed"))).toBe(false);
    expect(isNotFound(Object.assign(new Error("Internal error"), { status: 500 }))).toBe(false);
  });
});

describe("store cleanup", () => {
  const view = parseView(
    JSON.stringify({
      title: "T",
      sections: [{ items: [{ id: "a", title: "A", thread: "thr_child" }, { id: "b", title: "B" }] }],
    }),
  );

  function setup() {
    const db = new Database(":memory:");
    for (const statement of MIGRATIONS) db.exec(statement);
    return { db, store: createStore(db) };
  }

  it("lists each view with the thread that published it and the threads its items name", () => {
    const { store } = setup();
    const stored = store.publish("thr_parent", "k", view, null, "2026-10-01T00:00:00.000Z");
    expect(store.viewThreads()).toEqual([{ id: stored.id, threads: ["thr_parent", "thr_child"] }]);
  });

  it("removes a view with its item states, images, and hidden marks, and leaves the others", () => {
    const { db, store } = setup();
    const at = "2026-10-01T00:00:00.000Z";
    const gone = store.publish("thr_parent", "k", view, null, at);
    const kept = store.publish("thr_other", "k", view, null, at);
    for (const id of [gone.id, kept.id]) {
      store.setItem(id, "a", { state: "done", result: null }, at);
      store.putImages(id, [{ itemId: "a", index: 0, mime: "image/png", data: Buffer.from("png") }]);
      store.setLinkedHidden(id, "thr_child", true, at);
    }

    store.remove([gone.id]);

    expect(store.get(gone.id)).toBeNull();
    expect(store.get(kept.id)?.items.a?.state).toBe("done");
    for (const table of ["item_states", "images", "linked_hidden"]) {
      const rows = db.prepare(`SELECT view_id FROM ${table}`).all() as Array<{ view_id: number }>;
      expect(rows.map((row) => row.view_id)).toEqual([kept.id]);
    }
  });

  it("leaves the file alone while there is little free space", () => {
    const { store } = setup();
    expect(store.reclaim()).toBe(0);
  });
});

import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";

import type { NowList } from "./contract.js";
import { createStore, MIGRATIONS } from "./store.js";
import type { Item } from "./types.js";

function store() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db as never);
}

function item(id: string): Item {
  return {
    id,
    source: "todoist",
    title: id,
    description: "",
    priority: null,
    due: null,
    deadline: null,
    activityAt: null,
    context: null,
    tags: [],
    url: `https://example.com/${id}`,
    gmail: null,
    github: null,
  };
}

function list(ids: string[], fetchedAt: string): NowList {
  return {
    items: ids.map(item),
    sources: [{ id: "todoist", name: "Todoist", state: "ok", query: "today", count: ids.length }],
    fetchedAt,
  };
}

describe("store", () => {
  test("has nothing before the first sync", () => {
    expect(store().read()).toBeNull();
  });

  test("reads back what was written, in its order", () => {
    const s = store();
    const written = list(["b", "a", "c"], "2026-09-24T09:30:00.000Z");
    s.replace(written);

    expect(s.read()).toEqual(written);
  });

  test("replaces the whole list on the next write", () => {
    const s = store();
    s.replace(list(["a", "b"], "2026-09-24T09:30:00.000Z"));
    s.replace(list(["c"], "2026-09-24T09:45:00.000Z"));

    expect(s.read()).toEqual(list(["c"], "2026-09-24T09:45:00.000Z"));
  });

  test("takes one item out of the stored list", () => {
    const s = store();
    s.replace(list(["a", "b"], "2026-09-24T09:30:00.000Z"));
    s.removeItem("a");
    expect(s.read()?.items.map((kept) => kept.id)).toEqual(["b"]);
  });
});

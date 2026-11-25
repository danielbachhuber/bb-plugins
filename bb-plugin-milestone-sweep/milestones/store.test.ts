import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import type { StoredMilestone } from "./github.js";
import { createStore, MIGRATIONS } from "./store.js";

function open() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db as never);
}

const milestone = (repo: string, number: number): StoredMilestone => ({
  repo,
  number,
  title: `Release ${number}`,
  url: `https://github.com/${repo}/milestone/${number}`,
  due: null,
  createdAt: 0,
  open: 0,
  closed: 0,
  issues: [],
});

describe("store", () => {
  it("replaces a repository's milestones, so a closed one is gone", () => {
    const store = open();
    store.replaceRepo("acme/widgets", [milestone("acme/widgets", 1), milestone("acme/widgets", 2)]);
    store.replaceRepo("acme/widgets", [milestone("acme/widgets", 2)]);
    expect(store.readAll().map((m) => m.number)).toEqual([2]);
    expect(store.readOne("ACME/Widgets", 2)?.title).toBe("Release 2");
  });

  it("drops the milestones of a repository no longer listed", () => {
    const store = open();
    store.replaceRepo("acme/widgets", [milestone("acme/widgets", 1)]);
    store.replaceRepo("acme/gadgets", [milestone("acme/gadgets", 1)]);
    store.finishSync([{ repo: "acme/gadgets", error: null }], 100, null);
    expect(store.readAll().map((m) => m.repo)).toEqual(["acme/gadgets"]);
    expect(store.readRepositories()).toEqual([{ repo: "acme/gadgets", error: null }]);
    expect(store.readMeta()).toEqual({ syncedAt: 100, lastError: null });
  });

  it("keeps the last sync time when a sync fails", () => {
    const store = open();
    store.finishSync([], 100, null);
    store.recordFailure("gh is not authenticated");
    expect(store.readMeta()).toEqual({ syncedAt: 100, lastError: "gh is not authenticated" });
  });

  it("links a thread to an issue whatever the repository's spelling, until the thread goes", () => {
    const store = open();
    store.linkThread("acme/Widgets", 1401, "thr_a");
    store.linkThread("acme/widgets", 1402, "thr_b");
    store.linkThread("acme/gadgets", 301, "thr_c");
    expect([...store.threadsFor("ACME/widgets")]).toEqual([
      [1401, "thr_a"],
      [1402, "thr_b"],
    ]);
    expect(store.releaseThread("thr_a")).toBe(1);
    expect(store.releaseThreadsExcept(new Set(["thr_b"]))).toBe(1);
    expect([...store.threadsFor("acme/widgets")]).toEqual([[1402, "thr_b"]]);
    expect(store.threadsFor("acme/gadgets").size).toBe(0);
  });
});

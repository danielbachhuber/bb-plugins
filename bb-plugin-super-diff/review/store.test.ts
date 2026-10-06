import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createStore, MIGRATIONS } from "./store";
import type { StoredGrouping } from "./view";

function store() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db);
}

const STORED: StoredGrouping = {
  grouping: { headline: "Widgets call the sprocket.", concerns: [{ title: "All", note: "n", files: ["a.ts"] }] },
  assignments: [{ path: "a.ts", index: 0, hash: "h", concern: 0 }],
  baseSha: "base",
  headSha: "head",
  groupedAt: "2026-10-05T12:00:00.000Z",
};

describe("store", () => {
  it("returns null for a thread with no grouping", () => {
    expect(store().get("thr_1")).toBeNull();
  });

  it("round-trips a grouping and its snapshot, and replaces both on the next put", () => {
    const s = store();
    s.put("thr_1", STORED, new Map([["a.ts", { hash: "1", text: "one\n" }], ["gone.ts", { hash: null, text: null }]]));
    expect(s.get("thr_1")).toEqual(STORED);
    expect(s.snapshot("thr_1")).toEqual(new Map([["a.ts", { hash: "1", text: "one\n" }], ["gone.ts", { hash: null, text: null }]]));

    s.put("thr_1", { ...STORED, headSha: "head2" }, new Map([["b.ts", { hash: "2", text: null }]]));
    expect(s.get("thr_1")!.headSha).toBe("head2");
    expect([...s.snapshot("thr_1").keys()]).toEqual(["b.ts"]);
    expect(s.get("thr_2")).toBeNull();
  });

  it("keeps viewed marks per thread and hunk, and clears some", () => {
    const s = store();
    s.setViewed("thr_1", [{ path: "a.ts", index: 0, hash: "h1" }, { path: "a.ts", index: 2, hash: "h2" }, { path: "b.ts", index: 0, hash: "h3" }], true);
    s.setViewed("thr_2", [{ path: "a.ts", index: 0, hash: "h9" }], true);
    s.setViewed("thr_1", [{ path: "b.ts", index: 0, hash: "h3" }], false);
    s.setViewed("thr_1", [{ path: "a.ts", index: 2, hash: "h4" }], true);
    expect(s.viewed("thr_1")).toEqual(new Map([["a.ts#0", "h1"], ["a.ts#2", "h4"]]));
  });
});

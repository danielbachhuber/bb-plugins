import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, createStore, type DatabaseLike, type Link, type Store } from "./store.js";

let store: Store;

beforeEach(() => {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  store = createStore(db as unknown as DatabaseLike);
});

function link(overrides: Partial<Link> = {}): Link {
  return {
    threadId: "thr_one",
    repo: "acme/widgets",
    kind: "issue",
    number: 12,
    source: "prompt",
    createdAt: 100,
    ...overrides,
  };
}

describe("links", () => {
  it("keeps one link recorded for two reasons", () => {
    store.link(link({ source: "spawned:issue-sweep" }));
    store.link(link({ source: "prompt" }));
    expect(store.itemsForThread("thr_one").map((entry) => entry.source).sort()).toEqual([
      "prompt",
      "spawned:issue-sweep",
    ]);
  });

  it("ignores a link recorded twice for the same reason", () => {
    store.link(link());
    store.link(link({ createdAt: 200 }));
    expect(store.itemsForThread("thr_one")).toEqual([link()]);
  });

  it("stores the repository lowercased", () => {
    store.link(link({ repo: "Acme/Widgets" }));
    expect(store.itemsForThread("thr_one")[0]!.repo).toBe("acme/widgets");
  });

  it("unlinks one source, or every source", () => {
    store.link(link({ source: "spawned:pr-sweep", kind: "pull", number: 5 }));
    store.link(link());
    store.unlink("thr_one", "spawned:pr-sweep");
    expect(store.itemsForThread("thr_one")).toEqual([link()]);
    store.unlink("thr_one");
    expect(store.itemsForThread("thr_one")).toEqual([]);
  });

  it("replaces a thread's via-pr links and leaves its other links alone", () => {
    store.link(link());
    store.link(link({ number: 30, source: "via-pr" }));
    store.replaceViaPr("thr_one", [{ repo: "acme/widgets", number: 31 }], 500);
    expect(store.itemsForThread("thr_one")).toEqual([
      link(),
      link({ number: 31, source: "via-pr", createdAt: 500 }),
    ]);
  });

  it("finds threads for items, matching the repository case-insensitively", () => {
    store.link(link({ threadId: "thr_one" }));
    store.link(link({ threadId: "thr_two", source: "spawned:issue-sweep" }));
    store.link(link({ threadId: "thr_three", number: 99 }));
    const found = store.threadsForItems([
      { repo: "ACME/widgets", kind: "issue", number: 12 },
      { repo: "acme/widgets", kind: "pull", number: 12 },
    ]);
    expect(found).toEqual([
      {
        repo: "acme/widgets",
        kind: "issue",
        number: 12,
        threads: [
          { threadId: "thr_one", source: "prompt" },
          { threadId: "thr_two", source: "spawned:issue-sweep" },
        ],
      },
      { repo: "acme/widgets", kind: "pull", number: 12, threads: [] },
    ]);
  });
});

describe("prompt scan", () => {
  it("remembers which threads have been scanned", () => {
    expect(store.isScanned("thr_one")).toBe(false);
    store.markScanned("thr_one", 100);
    expect(store.isScanned("thr_one")).toBe(true);
    expect(store.unscanned(["thr_one", "thr_two"])).toEqual(["thr_two"]);
  });
});

describe("deleteThread", () => {
  it("forgets a deleted thread's links and scan", () => {
    store.link(link());
    store.link(link({ threadId: "thr_two" }));
    store.markScanned("thr_one", 100);
    store.deleteThread("thr_one");
    expect(store.itemsForThread("thr_one")).toEqual([]);
    expect(store.isScanned("thr_one")).toBe(false);
    expect(store.itemsForThread("thr_two")).toHaveLength(1);
  });
});

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, createStore } from "./store.js";
import type { ClassifiedRow } from "./types.js";

function freshStore() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db as never);
}

function row(overrides: Partial<ClassifiedRow> = {}): ClassifiedRow {
  return {
    repo: "acme/widgets",
    number: 1,
    title: "Add the widget endpoint",
    url: "https://github.com/acme/widgets/pull/1",
    isDraft: false,
    flags: ["conflict"],
    group: "needs-action",
    checks: { pass: 1, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 1 },
    approvedBy: [],
    commentedBy: [],
    waitingOn: [],
    awaitingReReview: false,
    ...overrides,
  };
}

describe("store", () => {
  it("round-trips a row with its arrays and nested checks intact", () => {
    const store = freshStore();
    store.replaceRepoRows("acme/widgets", [row({ approvedBy: ["hubber"], flags: ["merge-ready"] })]);
    const [read] = store.readRows();
    expect(read).toMatchObject({
      repo: "acme/widgets",
      approvedBy: ["hubber"],
      flags: ["merge-ready"],
      checks: { pass: 1, total: 1 },
    });
  });

  it("replaces only the named repository's rows", () => {
    const store = freshStore();
    store.replaceRepoRows("acme/widgets", [row({ number: 1 })]);
    store.replaceRepoRows("acme/gadgets", [row({ repo: "acme/gadgets", number: 2 })]);
    store.replaceRepoRows("acme/widgets", [row({ number: 3 })]);

    expect(store.readRows().map((entry) => `${entry.repo}#${entry.number}`).sort()).toEqual([
      "acme/gadgets#2",
      "acme/widgets#3",
    ]);
  });

  it("replaceAll drops repositories that no longer have open PRs", () => {
    const store = freshStore();
    store.replaceRepoRows("acme/gone", [row({ repo: "acme/gone", number: 9 })]);
    store.replaceAll({
      rows: [row({ number: 1 })],
      repos: ["acme/widgets"],
      failedRepos: [],
      skippedRepos: [],
      truncated: false,
      sweptAt: 1_700_000_000_000,
    });
    expect(store.readRows().map((entry) => entry.repo)).toEqual(["acme/widgets"]);
  });

  it("keeps a failed repository's previous rows on replaceAll", () => {
    const store = freshStore();
    store.replaceRepoRows("acme/flaky", [row({ repo: "acme/flaky", number: 5 })]);
    store.replaceAll({
      rows: [row({ number: 1 })],
      repos: ["acme/widgets", "acme/flaky"],
      failedRepos: ["acme/flaky"],
      skippedRepos: [],
      truncated: false,
      sweptAt: 1_700_000_000_000,
    });
    expect(store.readRows().map((entry) => entry.repo).sort()).toEqual([
      "acme/flaky",
      "acme/widgets",
    ]);
  });

  it("records sweep metadata and clears the previous error on success", () => {
    const store = freshStore();
    store.recordFailure("network down");
    expect(store.readMeta().lastError).toBe("network down");

    store.replaceAll({
      rows: [],
      repos: [],
      failedRepos: ["acme/flaky"],
      skippedRepos: [],
      truncated: true,
      sweptAt: 1_700_000_000_000,
    });
    expect(store.readMeta()).toMatchObject({
      sweptAt: 1_700_000_000_000,
      failedRepos: ["acme/flaky"],
      skippedRepos: [],
      truncated: true,
      lastError: null,
    });
  });

  it("reports an empty meta before the first sweep", () => {
    expect(freshStore().readMeta()).toMatchObject({ sweptAt: null, lastError: null });
  });
});

describe("legacy thread links", () => {
  function legacyStore() {
    const db = new Database(":memory:");
    for (const statement of MIGRATIONS) db.exec(statement);
    db.prepare(
      `INSERT INTO pr_thread_links (thread_id, repo, number, created_at) VALUES (?, ?, ?, ?)`,
    ).run("thr_2", "acme/widgets", 42, 2);
    db.prepare(
      `INSERT INTO pr_thread_links (thread_id, repo, number, created_at) VALUES (?, ?, ?, ?)`,
    ).run("thr_1", "acme/widgets", 42, 1);
    return { db, store: createStore(db as never) };
  }

  it("reads the links a checkout recorded before gh-context, oldest first", () => {
    expect(legacyStore().store.legacyThreadLinks()).toEqual([
      { repo: "acme/widgets", number: 42, threadId: "thr_1", createdAt: 1 },
      { repo: "acme/widgets", number: 42, threadId: "thr_2", createdAt: 2 },
    ]);
  });

  it("drops the legacy tables, after which there is nothing left to move", () => {
    const { db, store } = legacyStore();
    store.dropLegacyThreadLinks();
    expect(store.legacyThreadLinks()).toEqual([]);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).not.toContain("pr_thread_links");
    expect(tables).not.toContain("thread_scan");
    // A store created afterwards does not trip over the missing tables.
    expect(createStore(db as never).legacyThreadLinks()).toEqual([]);
  });
});

describe("notes", () => {
  it("saves a note and reads it back by pull request", () => {
    const store = freshStore();
    store.setNote("acme/widgets", 12, "Ask octocat about the retry", 1);
    expect(store.notes().get("acme/widgets#12")).toBe("Ask octocat about the retry");
  });

  it("replaces a note rather than keeping two", () => {
    const store = freshStore();
    store.setNote("acme/widgets", 12, "First", 1);
    store.setNote("acme/widgets", 12, "Second", 2);
    expect([...store.notes().values()]).toEqual(["Second"]);
  });

  it("deletes the note when the new text is empty, rather than saving blank text", () => {
    const store = freshStore();
    store.setNote("acme/widgets", 12, "First", 1);
    store.setNote("acme/widgets", 12, "   ", 2);
    expect(store.notes().has("acme/widgets#12")).toBe(false);
  });

  it("keys by repository as well as number", () => {
    const store = freshStore();
    store.setNote("acme/widgets", 12, "Widgets", 1);
    store.setNote("acme/gadgets", 12, "Gadgets", 1);
    expect(store.notes().get("acme/gadgets#12")).toBe("Gadgets");
  });
});

describe("seen comment counts", () => {
  it("records the count on first sight, so a first sync shows nothing new", () => {
    const store = freshStore();
    store.recordFirstSeen([row({ number: 12, commentsCount: 5 })], 1);
    expect(store.seenCounts().get("acme/widgets#12")).toBe(5);
  });

  it("never moves a count it already has on a later sweep", () => {
    const store = freshStore();
    store.recordFirstSeen([row({ number: 12, commentsCount: 5 })], 1);
    store.recordFirstSeen([row({ number: 12, commentsCount: 8 })], 2);
    expect(store.seenCounts().get("acme/widgets#12")).toBe(5);
  });

  it("moves the count up to the current one when the pull request is opened", () => {
    const store = freshStore();
    store.recordFirstSeen([row({ number: 12, commentsCount: 5 })], 1);
    store.markSeen("acme/widgets", 12, 8, 2);
    expect(store.seenCounts().get("acme/widgets#12")).toBe(8);
  });

  it("marks a pull request seen that no sweep has recorded yet", () => {
    const store = freshStore();
    store.markSeen("acme/widgets", 12, 3, 1);
    expect(store.seenCounts().get("acme/widgets#12")).toBe(3);
  });
});

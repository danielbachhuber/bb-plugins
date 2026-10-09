import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, createStore, type DatabaseLike, type Store } from "./store.js";
import type { IssueRow, SweepResult } from "./types.js";

function row(overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    repo: "acme/widgets",
    number: 12,
    title: "Widget rotation drifts after a resize",
    url: "https://github.com/acme/widgets/issues/12",
    labels: ["bug"],
    createdAt: 100,
    updatedAt: 200,
    commentsCount: 3,
    boardStatus: null,
    onBoard: false,
    blockedBy: 0,
    closingPr: null,
    subtasks: null,
    ...overrides,
  };
}

function result(overrides: Partial<SweepResult> = {}): SweepResult {
  return {
    rows: [row()],
    truncated: false,
    failedRepos: [],
    skippedRepos: [],
    sweptAt: 1_700_000_000_000,
    ...overrides,
  };
}

let store: Store;

beforeEach(() => {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  store = createStore(db as unknown as DatabaseLike);
});

describe("createStore", () => {
  it("starts empty, with nothing swept", () => {
    expect(store.readRows()).toEqual([]);
    expect(store.readMeta()).toEqual({
      sweptAt: null,
      skippedRepos: [],
      truncated: false,
      lastError: null,
    });
  });

  it("round-trips a row through json without losing a field", () => {
    store.replaceAll(result());
    expect(store.readRows()).toEqual([row()]);
  });

  it("reads rows back newest first, whatever order they were written in", () => {
    store.replaceAll(
      result({ rows: [row({ number: 1, updatedAt: 100 }), row({ number: 2, updatedAt: 300 })] }),
    );
    expect(store.readRows().map((entry) => entry.number)).toEqual([2, 1]);
  });

  it("drops issues that a later sweep no longer carries", () => {
    store.replaceAll(result({ rows: [row({ number: 1 }), row({ number: 2 })] }));
    store.replaceAll(result({ rows: [row({ number: 2 })] }));
    expect(store.readRows().map((entry) => entry.number)).toEqual([2]);
  });

  it("records the sweep time and the truncation flag", () => {
    store.replaceAll(result({ truncated: true, sweptAt: 42 }));
    expect(store.readMeta()).toEqual({
      sweptAt: 42,
      skippedRepos: [],
      truncated: true,
      lastError: null,
    });
  });

  it("records the repositories the project filter held back", () => {
    // The panel's only evidence that a filter, not an empty queue, emptied it.
    store.replaceAll(result({ rows: [], skippedRepos: ["acme/gadgets"] }));
    expect(store.readMeta().skippedRepos).toEqual(["acme/gadgets"]);
  });

  it("keeps the last rows when a sweep fails, so the panel does not blank", () => {
    store.replaceAll(result());
    store.recordFailure("`gh` was not found on PATH.");
    expect(store.readRows()).toEqual([row()]);
    expect(store.readMeta().lastError).toBe("`gh` was not found on PATH.");
    expect(store.readMeta().sweptAt).toBe(1_700_000_000_000);
  });

  it("clears a recorded failure once a sweep succeeds", () => {
    store.recordFailure("`gh` is not authenticated. Run `gh auth login`.");
    store.replaceAll(result());
    expect(store.readMeta().lastError).toBeNull();
  });

  it("survives a sweep that returns nothing", () => {
    store.replaceAll(result());
    store.replaceAll(result({ rows: [] }));
    expect(store.readRows()).toEqual([]);
    expect(store.readMeta().sweptAt).toBe(1_700_000_000_000);
  });
});

describe("auto-applied board status", () => {
  it("remembers the last status this plugin applied on its own", () => {
    store.recordAutoStatus("acme/widgets", 12, "In Review", 1_700_000_000_000);
    expect(store.autoAppliedStatus("acme/widgets", 12)).toBe("In Review");
  });

  it("reports nothing for an issue it has never moved", () => {
    expect(store.autoAppliedStatus("acme/widgets", 99)).toBeNull();
  });

  it("keeps one record per issue, the most recent", () => {
    // Start thread writes In Progress, then a pull request writes In Review;
    // only the latter should block a repeat.
    store.recordAutoStatus("acme/widgets", 12, "In Progress", 1);
    store.recordAutoStatus("acme/widgets", 12, "In Review", 2);
    expect(store.autoAppliedStatus("acme/widgets", 12)).toBe("In Review");
  });

  it("keys by repository as well as number", () => {
    store.recordAutoStatus("acme/widgets", 12, "In Review", 1);
    expect(store.autoAppliedStatus("acme/gadgets", 12)).toBeNull();
  });

  it("survives the listing being swapped out under it", () => {
    // replaceAll wipes rows; a card this plugin already moved must not become
    // eligible to be moved again just because the sweep refreshed.
    store.recordAutoStatus("acme/widgets", 12, "In Review", 1);
    store.replaceAll(result());
    expect(store.autoAppliedStatus("acme/widgets", 12)).toBe("In Review");
  });
});

describe("status moves", () => {
  it("records when an issue was last moved from here, keyed repo#number", () => {
    store.recordMove("acme/widgets", 12, 100);
    store.recordMove("acme/widgets", 12, 300);
    store.recordMove("acme/gadgets", 12, 200);
    expect(store.moves()).toEqual(
      new Map([
        ["acme/widgets#12", 300],
        ["acme/gadgets#12", 200],
      ]),
    );
  });

  it("counts every move this plugin made on its own before moves were recorded", () => {
    // A database from before the table: the automatic moves are in board_auto.
    const db = new Database(":memory:");
    const index = MIGRATIONS.findIndex((statement) => statement.includes("status_moves"));
    for (const statement of MIGRATIONS.slice(0, index)) db.exec(statement);
    db.prepare(`INSERT INTO board_auto (repo, number, status, applied_at) VALUES (?, ?, ?, ?)`).run(
      "acme/widgets",
      12,
      "In Review",
      400,
    );
    for (const statement of MIGRATIONS.slice(index)) db.exec(statement);
    expect(createStore(db as unknown as DatabaseLike).moves().get("acme/widgets#12")).toBe(400);
  });

  it("survives the listing being swapped out under it", () => {
    store.recordMove("acme/widgets", 12, 100);
    store.replaceAll(result());
    expect(store.moves().get("acme/widgets#12")).toBe(100);
  });
});

describe("setRowStatus", () => {
  it("moves a stored row to its new status without a sweep", () => {
    store.replaceAll(result({ rows: [row({ boardStatus: "Ready" })] }));

    expect(store.setRowStatus("acme/widgets", 12, "In Progress")).toBe(true);
    expect(store.readRows()[0]!.boardStatus).toBe("In Progress");
  });

  it("leaves every other field of the row alone", () => {
    store.replaceAll(result({ rows: [row({ boardStatus: "Ready", onBoard: true })] }));
    store.setRowStatus("acme/widgets", 12, "In Progress");

    expect(store.readRows()[0]).toEqual(row({ boardStatus: "In Progress", onBoard: true }));
  });

  it("reports nothing done when the row already reads that way", () => {
    store.replaceAll(result({ rows: [row({ boardStatus: "In Progress" })] }));

    expect(store.setRowStatus("acme/widgets", 12, "In Progress")).toBe(false);
  });

  it("reports nothing done when the row is not in the listing", () => {
    store.replaceAll(result());

    expect(store.setRowStatus("acme/widgets", 999, "In Progress")).toBe(false);
    expect(store.setRowStatus("acme/gadgets", 12, "In Progress")).toBe(false);
  });

  it("gives way to the next sweep, which is the board's own answer", () => {
    store.replaceAll(result({ rows: [row({ boardStatus: "Ready" })] }));
    store.setRowStatus("acme/widgets", 12, "In Progress");
    store.replaceAll(result({ rows: [row({ boardStatus: "Backlog" })] }));

    expect(store.readRows()[0]!.boardStatus).toBe("Backlog");
  });
});

describe("legacy thread links", () => {
  it("reads links recorded before gh-context, oldest first, then drops their tables", () => {
    const db = new Database(":memory:");
    for (const statement of MIGRATIONS) db.exec(statement);
    const insert = db.prepare(
      `INSERT INTO issue_thread_links (thread_id, repo, number, created_at) VALUES (?, ?, ?, ?)`,
    );
    insert.run("thr_2", "acme/widgets", 12, 2);
    insert.run("thr_1", "acme/widgets", 12, 1);
    const legacy = createStore(db as unknown as DatabaseLike);
    expect(legacy.legacyThreadLinks()).toEqual([
      { repo: "acme/widgets", number: 12, threadId: "thr_1", createdAt: 1 },
      { repo: "acme/widgets", number: 12, threadId: "thr_2", createdAt: 2 },
    ]);
    legacy.dropLegacyThreadLinks();
    expect(legacy.legacyThreadLinks()).toEqual([]);
    // A store created afterwards does not trip over the missing tables.
    expect(createStore(db as unknown as DatabaseLike).legacyThreadLinks()).toEqual([]);
  });
});

describe("notes", () => {
  it("saves a note and reads it back by issue", () => {
    store.setNote("acme/widgets", 12, "Ask octocat about the resize case", 1);
    expect(store.notes().get("acme/widgets#12")).toBe("Ask octocat about the resize case");
  });

  it("replaces a note rather than keeping two", () => {
    store.setNote("acme/widgets", 12, "First", 1);
    store.setNote("acme/widgets", 12, "Second", 2);
    expect([...store.notes().values()]).toEqual(["Second"]);
  });

  it("deletes the note when the new text is empty, rather than saving blank text", () => {
    store.setNote("acme/widgets", 12, "First", 1);
    store.setNote("acme/widgets", 12, "   ", 2);
    expect(store.notes().has("acme/widgets#12")).toBe(false);
  });

  it("keeps an issue on hold with no text, and reads no note for it", () => {
    store.setNote("acme/widgets", 12, "", 1, true);
    expect(store.holds().has("acme/widgets#12")).toBe(true);
    expect(store.notes().has("acme/widgets#12")).toBe(false);
  });

  it("keeps the note's text when the hold is cleared", () => {
    store.setNote("acme/widgets", 12, "Waiting on #31", 1, true);
    store.setNote("acme/widgets", 12, "Waiting on #31", 2, false);
    expect(store.holds().size).toBe(0);
    expect(store.notes().get("acme/widgets#12")).toBe("Waiting on #31");
  });

  it("keys by repository as well as number", () => {
    store.setNote("acme/widgets", 12, "Widgets", 1);
    store.setNote("acme/gadgets", 12, "Gadgets", 1);
    expect(store.notes().get("acme/gadgets#12")).toBe("Gadgets");
  });
});

describe("seen comment counts", () => {
  it("records the count on first sight, so a first sync shows nothing new", () => {
    store.recordFirstSeen([row({ commentsCount: 5 })], 1);
    expect(store.seenCounts().get("acme/widgets#12")).toBe(5);
  });

  it("never moves a count it already has on a later sweep", () => {
    store.recordFirstSeen([row({ commentsCount: 5 })], 1);
    store.recordFirstSeen([row({ commentsCount: 8 })], 2);
    expect(store.seenCounts().get("acme/widgets#12")).toBe(5);
  });

  it("moves the count up to the current one when the issue is opened", () => {
    store.recordFirstSeen([row({ commentsCount: 5 })], 1);
    store.markSeen("acme/widgets", 12, 8, 2);
    expect(store.seenCounts().get("acme/widgets#12")).toBe(8);
  });

  it("marks an issue seen that no sweep has recorded yet", () => {
    store.markSeen("acme/widgets", 12, 3, 1);
    expect(store.seenCounts().get("acme/widgets#12")).toBe(3);
  });
});

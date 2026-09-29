import { describe, expect, it } from "vitest";
import {
  ISSUE_RUNS,
  isStale,
  parseStaleAfterDays,
  runOf,
  sortIssues,
  stageOf,
  type ListedIssue,
  type TierInputs,
} from "./tiers.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const inputs: TierInputs = {
  countedStatuses: ["Ready", "In Progress"],
  reviewStatus: "In Review",
  boardStages: ["Backlog", "Ready", "In Progress", "In Review"],
  staleAfterDays: 7,
  now: NOW,
};

let nextNumber = 1;

function issue(overrides: Partial<ListedIssue> = {}): ListedIssue {
  return {
    repo: "acme/widgets",
    number: nextNumber++,
    title: "Widget rotation drifts after a resize",
    url: "https://github.com/acme/widgets/issues/1",
    labels: [],
    boardStatus: "Ready",
    onBoard: true,
    blockedBy: 0,
    closingPr: null,
    subtasks: null,
    threadId: null,
    canSpawn: true,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - HOUR,
    commentsCount: 0,
    note: null,
    newComments: 0,
    parent: null,
    ...overrides,
  };
}

const PARENT = { completed: 1, total: 3, source: "sub-issues" as const };

describe("runOf, Now", () => {
  it("puts an issue with a thread in working", () => {
    expect(runOf(issue({ threadId: "thr_1" }), inputs)).toBe("working");
  });

  it("puts an issue with new comments in new comments", () => {
    expect(runOf(issue({ newComments: 2, boardStatus: "Backlog" }), inputs)).toBe("new-comments");
  });

  it("puts a counted issue untouched for longer than the setting in stale", () => {
    expect(runOf(issue({ updatedAt: NOW - 8 * DAY }), inputs)).toBe("stale");
  });

  it("takes new comments over stale, and stale over working", () => {
    const old = NOW - 20 * DAY;
    expect(runOf(issue({ newComments: 1, threadId: "thr_1", updatedAt: old }), inputs)).toBe("new-comments");
    expect(runOf(issue({ threadId: "thr_1", updatedAt: old }), inputs)).toBe("stale");
  });
});

describe("isStale", () => {
  it("needs a counted status", () => {
    expect(isStale(issue({ boardStatus: "Backlog", updatedAt: NOW - 20 * DAY }), inputs)).toBe(false);
  });

  it("never calls a blocked issue stale", () => {
    expect(isStale(issue({ blockedBy: 1, updatedAt: NOW - 20 * DAY }), inputs)).toBe(false);
  });

  it("waits the full number of days", () => {
    expect(isStale(issue({ updatedAt: NOW - 6 * DAY }), inputs)).toBe(false);
    expect(isStale(issue({ updatedAt: NOW - 7 * DAY - 1 }), inputs)).toBe(true);
  });
});

describe("runOf, Next", () => {
  it("puts a counted, unblocked issue on the board in to start", () => {
    expect(runOf(issue({ boardStatus: "In Progress" }), inputs)).toBe("to-start");
  });

  it("matches the counted status however it is cased", () => {
    expect(runOf(issue({ boardStatus: "ready" }), inputs)).toBe("to-start");
  });

  it("leaves a blocked issue out of Next", () => {
    expect(runOf(issue({ blockedBy: 2 }), inputs)).toBe("blocked");
  });

  it("leaves a parent out of Next", () => {
    expect(runOf(issue({ subtasks: PARENT }), inputs)).toBe("later");
  });

  it("does not count a task list as sub-issues", () => {
    expect(runOf(issue({ subtasks: { completed: 1, total: 3, source: "tasks" } }), inputs)).toBe("to-start");
  });

  it("leaves an issue off the board out of Next", () => {
    expect(runOf(issue({ onBoard: false, boardStatus: null }), inputs)).toBe("later");
  });
});

describe("runOf, Later", () => {
  it("puts an issue in the review status in waiting", () => {
    expect(runOf(issue({ boardStatus: "In Review" }), inputs)).toBe("waiting");
  });

  it("puts an uncounted status in later", () => {
    expect(runOf(issue({ boardStatus: "Backlog" }), inputs)).toBe("later");
  });

  it("puts a status the stages do not name in later", () => {
    expect(runOf(issue({ boardStatus: "Stalled" }), inputs)).toBe("later");
  });
});

describe("sortIssues", () => {
  it("orders Later as waiting, other statuses in board order, off the board, parents, blocked", () => {
    const blocked = issue({ title: "blocked", blockedBy: 1, updatedAt: NOW - HOUR });
    const parent = issue({ title: "parent", subtasks: PARENT, updatedAt: NOW - 2 * HOUR });
    const offBoard = issue({ title: "off", onBoard: false, boardStatus: null, updatedAt: NOW - 3 * HOUR });
    const stalled = issue({ title: "stalled", boardStatus: "Stalled", updatedAt: NOW - 4 * HOUR });
    const backlog = issue({ title: "backlog", boardStatus: "Backlog", updatedAt: NOW - 5 * HOUR });
    const waiting = issue({ title: "waiting", boardStatus: "In Review", updatedAt: NOW - 6 * HOUR });

    const sorted = sortIssues([blocked, parent, offBoard, stalled, backlog, waiting], inputs);
    expect(sorted.map((row) => row.title)).toEqual(["waiting", "backlog", "stalled", "off", "parent", "blocked"]);
  });

  it("puts the most recently updated first within a run", () => {
    const older = issue({ title: "older", updatedAt: NOW - 5 * HOUR });
    const newer = issue({ title: "newer", updatedAt: NOW - HOUR });
    expect(sortIssues([older, newer], inputs).map((row) => row.title)).toEqual(["newer", "older"]);
  });

  it("lists rows in the order of the runs, so a filtered list keeps its order", () => {
    const rows = [
      issue({ blockedBy: 1 }),
      issue({ boardStatus: "Backlog" }),
      issue({ boardStatus: "In Review" }),
      issue({ boardStatus: "Ready", updatedAt: NOW - 2 * HOUR }),
      issue({ threadId: "thr_1" }),
      issue({ updatedAt: NOW - 9 * DAY }),
      issue({ newComments: 1, boardStatus: "Backlog" }),
      issue({ boardStatus: "Stalled" }),
      issue({ onBoard: false, boardStatus: null }),
    ];
    const order = ISSUE_RUNS.map((run) => run.id);
    const runs = sortIssues(rows, inputs).map((row) => order.indexOf(runOf(row, inputs)));
    expect(runs).toEqual([...runs].sort((a, b) => a - b));
    expect(new Set(runs).size).toBe(ISSUE_RUNS.length);
  });
});

describe("a status the stages do not name", () => {
  it("has no stage, and still sorts by the tier rules", () => {
    const stalled = issue({ boardStatus: "Stalled" });
    expect(stageOf(stalled, inputs.boardStages)).toBeNull();
    expect(runOf(stalled, inputs)).toBe("later");
    const withThread = issue({ boardStatus: "Stalled", threadId: "thr_1" });
    expect(runOf(withThread, inputs)).toBe("working");
  });
});

describe("stageOf", () => {
  it("finds the status among the stages, however it is cased", () => {
    expect(stageOf(issue({ boardStatus: "in progress" }), inputs.boardStages)).toBe(2);
  });

  it("has no stage off the board or without a status", () => {
    expect(stageOf(issue({ onBoard: false, boardStatus: null }), inputs.boardStages)).toBeNull();
    expect(stageOf(issue({ onBoard: true, boardStatus: null }), inputs.boardStages)).toBeNull();
  });
});

describe("parseStaleAfterDays", () => {
  it("reads a positive whole number", () => {
    expect(parseStaleAfterDays(" 3 ")).toBe(3);
  });

  it("falls back to seven for anything else", () => {
    for (const raw of ["", "0", "-2", "1.5", "soon"]) expect(parseStaleAfterDays(raw)).toBe(7);
  });
});

import { describe, expect, it } from "vitest";
import {
  PR_RUNS,
  flagsFor,
  isStale,
  parseStaleAfterDays,
  pinOf,
  runOf,
  sortPrs,
  stageOf,
  type ListedPr,
  type TierInputs,
} from "./tiers.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const inputs: TierInputs = { staleAfterDays: 3, now: NOW };

const GREEN = { pass: 4, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 4 };

let nextNumber = 1;

function pr(overrides: Partial<ListedPr> = {}): ListedPr {
  const flags = overrides.flags ?? [];
  return {
    repo: "acme/widgets",
    number: nextNumber++,
    title: "Cache widget thumbnails",
    url: "https://github.com/acme/widgets/pull/1",
    isDraft: false,
    flags,
    group: flags.includes("merge-ready") ? "ready-to-merge" : flags.length > 0 ? "needs-action" : "clean",
    checks: GREEN,
    approvedBy: [],
    commentedBy: [],
    waitingOn: ["hubber"],
    awaitingReReview: false,
    lastCommentBy: null,
    unresolvedThreads: 0,
    outdatedThreads: 0,
    notedBy: [],
    canSpawn: true,
    threadId: null,
    threadIds: [],
    updatedAt: NOW - HOUR,
    commentsCount: 0,
    note: null,
    newComments: 0,
    ...overrides,
  };
}

describe("runOf", () => {
  it("puts a pull request that needs action in needs you", () => {
    expect(runOf(pr({ flags: ["conflict"] }))).toBe("needs-you");
  });

  it("puts one ready to merge in ready", () => {
    expect(runOf(pr({ flags: ["merge-ready"], approvedBy: ["hubber"], waitingOn: [] }))).toBe("ready");
  });

  it("puts one with a thread in working, whatever its flags", () => {
    expect(runOf(pr({ flags: ["conflict"], threadId: "thr_1" }))).toBe("working");
    expect(runOf(pr({ flags: ["merge-ready"], waitingOn: [], threadId: "thr_1" }))).toBe("working");
  });

  it("puts a draft in drafts, flagged or not", () => {
    expect(runOf(pr({ isDraft: true }))).toBe("drafts");
    expect(runOf(pr({ isDraft: true, flags: ["ci-failing"] }))).toBe("drafts");
  });

  it("puts one waiting on CI, partly approved, or awaiting review in waiting", () => {
    expect(runOf(pr({ flags: ["ci-pending"] }))).toBe("waiting");
    expect(runOf(pr({ flags: ["merge-ready"], approvedBy: ["hubber"], waitingOn: ["octocat"] }))).toBe("waiting");
    expect(runOf(pr())).toBe("waiting");
  });
});

describe("stageOf", () => {
  it("puts a draft in Draft, even with checks failing", () => {
    expect(stageOf(pr({ isDraft: true }))).toBe(0);
    expect(stageOf(pr({ isDraft: true, flags: ["ci-failing"] }))).toBe(0);
  });

  it("puts checks that are not green in Checks", () => {
    for (const flag of ["ci-failing", "ci-pending", "ci-cancelled", "ci-absent"]) {
      expect(stageOf(pr({ flags: [flag] }))).toBe(1);
    }
    expect(stageOf(pr({ flags: ["conflict", "ci-failing"] }))).toBe(1);
  });

  it("puts a green pull request that is not approved in Review", () => {
    expect(stageOf(pr())).toBe(2);
    expect(stageOf(pr({ flags: ["conflict"] }))).toBe(2);
    expect(stageOf(pr({ flags: ["merge-blocked"], approvedBy: ["hubber"] }))).toBe(2);
  });

  it("puts a merge-ready pull request in Merge", () => {
    expect(stageOf(pr({ flags: ["merge-ready"], approvedBy: ["hubber"] }))).toBe(3);
  });
});

describe("isStale", () => {
  const old = NOW - 4 * DAY;

  it("calls a pull request awaiting review stale once it has waited the setting's days", () => {
    expect(isStale(pr({ updatedAt: old }), inputs)).toBe(true);
    expect(isStale(pr({ updatedAt: NOW - 2 * DAY }), inputs)).toBe(false);
    expect(isStale(pr({ updatedAt: NOW - 3 * DAY - 1 }), inputs)).toBe(true);
  });

  it("never calls one waiting on CI or partly approved stale", () => {
    expect(isStale(pr({ flags: ["ci-pending"], updatedAt: old }), inputs)).toBe(false);
    expect(
      isStale(pr({ flags: ["merge-ready"], approvedBy: ["hubber"], waitingOn: ["octocat"], updatedAt: old }), inputs),
    ).toBe(false);
  });

  it("never calls one outside the waiting run stale", () => {
    expect(isStale(pr({ flags: ["conflict"], updatedAt: old }), inputs)).toBe(false);
    expect(isStale(pr({ isDraft: true, updatedAt: old }), inputs)).toBe(false);
    expect(isStale(pr({ threadId: "thr_1", updatedAt: old }), inputs)).toBe(false);
  });
});

describe("flagsFor", () => {
  it("names each problem the way the badges did, worst first", () => {
    expect(flagsFor(pr({ flags: ["conflict", "ci-failing", "feedback"] }), inputs)).toEqual([
      { kind: "problem", text: "merge conflict" },
      { kind: "problem", text: "CI failing" },
      { kind: "problem", text: "reviewer feedback" },
    ]);
  });

  it("does not call a run in flight or a ready pull request a problem", () => {
    expect(flagsFor(pr({ flags: ["ci-pending"] }), inputs)).toEqual([]);
    expect(flagsFor(pr({ flags: ["merge-ready"], approvedBy: ["hubber"], waitingOn: [] }), inputs)).toEqual([]);
    expect(flagsFor(pr({ flags: ["conflict", "ci-pending"] }), inputs)).toEqual([
      { kind: "problem", text: "merge conflict" },
    ]);
  });

  it("says how long a stale pull request has waited", () => {
    expect(flagsFor(pr({ updatedAt: NOW - 5 * DAY - HOUR }), inputs)).toEqual([
      { kind: "stale", text: "Waiting 5 days" },
    ]);
  });
});

describe("sortPrs", () => {
  it("puts the newest first", () => {
    const old = pr({ title: "old", updatedAt: NOW - 2 * DAY });
    const fresh = pr({ title: "fresh", updatedAt: NOW - HOUR });
    const draft = pr({ title: "draft", isDraft: true, updatedAt: NOW - 2 * HOUR });
    expect(sortPrs([old, draft, fresh], inputs).map((row) => row.title)).toEqual(["fresh", "draft", "old"]);
  });

  it("pins the overdue and then the ones being worked on above the newest", () => {
    const fresh = pr({ title: "fresh", flags: ["ci-failing"], updatedAt: NOW - HOUR });
    const working = pr({ title: "working", threadId: "thr_1", updatedAt: NOW - 2 * DAY });
    const overdue = pr({ title: "overdue", updatedAt: NOW - 5 * DAY });
    expect(pinOf(overdue, inputs)).toBe(0);
    expect(pinOf(working, inputs)).toBe(1);
    expect(pinOf(fresh, inputs)).toBeNull();
    expect(sortPrs([fresh, working, overdue], inputs).map((row) => row.title)).toEqual(["overdue", "working", "fresh"]);
  });

  it("breaks a tie in time by repository, then number", () => {
    const gadgets = pr({ title: "gadgets", repo: "acme/gadgets", number: 9, updatedAt: NOW - HOUR });
    const widgets2 = pr({ title: "widgets 2", repo: "acme/widgets", number: 2, updatedAt: NOW - HOUR });
    const widgets5 = pr({ title: "widgets 5", repo: "acme/widgets", number: 5, updatedAt: NOW - HOUR });
    expect(sortPrs([widgets5, widgets2, gadgets], inputs).map((row) => row.title)).toEqual([
      "gadgets",
      "widgets 2",
      "widgets 5",
    ]);
  });
});

describe("PR_RUNS", () => {
  it("has the runs, colours, and tiers the spec names, in list order", () => {
    expect(PR_RUNS.map(({ id, tone, tier }) => [id, tone, tier])).toEqual([
      ["needs-you", "late", "now"],
      ["ready", "new", "now"],
      ["working", "underway", "now"],
      ["drafts", "next", "next"],
      ["waiting", "later", "later"],
    ]);
  });
});

describe("parseStaleAfterDays", () => {
  it("reads a positive whole number", () => {
    expect(parseStaleAfterDays(" 5 ")).toBe(5);
  });

  it("falls back to three for anything else", () => {
    for (const raw of ["", "0", "-2", "1.5", "soon"]) expect(parseStaleAfterDays(raw)).toBe(3);
  });
});

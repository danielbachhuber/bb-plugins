import { describe, expect, it } from "vitest";
import {
  PR_RUNS,
  flagsFor,
  isStale,
  parseStaleAfterDays,
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
  it("orders the waiting run as waiting on CI, partly approved, then awaiting review", () => {
    const awaiting = pr({ title: "awaiting" });
    const partial = pr({ title: "partial", flags: ["merge-ready"], approvedBy: ["hubber"], waitingOn: ["octocat"] });
    const onCi = pr({ title: "ci", flags: ["ci-pending"] });
    expect(sortPrs([awaiting, partial, onCi]).map((row) => row.title)).toEqual(["ci", "partial", "awaiting"]);
  });

  it("puts the worst flag first within a run, then repository and number", () => {
    const noReviewer = pr({ title: "no reviewer", repo: "acme/widgets", number: 5, flags: ["no-reviewer"], waitingOn: [] });
    const conflictGadgets = pr({ title: "gadgets", repo: "acme/gadgets", number: 9, flags: ["conflict"] });
    const conflictWidgets = pr({ title: "widgets", repo: "acme/widgets", number: 2, flags: ["conflict"] });
    expect(sortPrs([noReviewer, conflictWidgets, conflictGadgets]).map((row) => row.title)).toEqual([
      "gadgets",
      "widgets",
      "no reviewer",
    ]);
  });

  it("lists rows in the order of the runs, so a filtered list keeps its order", () => {
    const rows = [
      pr({ isDraft: true }),
      pr({ flags: ["ci-pending"] }),
      pr(),
      pr({ threadId: "thr_1" }),
      pr({ flags: ["merge-ready"], approvedBy: ["hubber"], waitingOn: [] }),
      pr({ flags: ["ci-failing"] }),
      pr({ flags: ["merge-ready"], approvedBy: ["hubber"], waitingOn: ["octocat"] }),
    ];
    const order = PR_RUNS.map((run) => run.id);
    const runs = sortPrs(rows).map((row) => order.indexOf(runOf(row)));
    expect(runs).toEqual([...runs].sort((a, b) => a - b));
    expect(new Set(runs).size).toBe(PR_RUNS.length);
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

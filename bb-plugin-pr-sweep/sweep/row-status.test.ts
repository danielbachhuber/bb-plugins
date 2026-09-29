import { describe, expect, it } from "vitest";
import { bannerFor, blockedStageOf, checksGlyph, diffOf, reviewersFor } from "./row-status.js";
import type { ListedPr } from "./tiers.js";

const GREEN = { pass: 4, fail: 0, skip: 1, pending: 0, cancelled: 0, total: 5 };

function pr(overrides: Partial<ListedPr> = {}): ListedPr {
  const flags = overrides.flags ?? [];
  return {
    repo: "acme/widgets",
    number: 1,
    title: "Cache widget thumbnails",
    url: "https://github.com/acme/widgets/pull/1",
    isDraft: false,
    flags,
    group: flags.includes("merge-ready") ? "ready-to-merge" : flags.length > 0 ? "needs-action" : "clean",
    checks: GREEN,
    approvedBy: [],
    commentedBy: [],
    waitingOn: [],
    awaitingReReview: false,
    lastCommentBy: null,
    unresolvedThreads: 0,
    outdatedThreads: 0,
    notedBy: [],
    canSpawn: true,
    threadId: null,
    threadIds: [],
    updatedAt: 0,
    commentsCount: 0,
    note: null,
    newComments: 0,
    ...overrides,
  };
}

describe("bannerFor", () => {
  it("leads with a merge conflict, naming the base branch", () => {
    expect(bannerFor(pr({ flags: ["conflict", "ci-failing"], baseRefName: "main" }))).toEqual({
      tone: "blocked",
      text: "Merge conflict with main",
    });
    expect(bannerFor(pr({ flags: ["conflict"], baseRefName: "trunk" }))?.text).toBe("Merge conflict with trunk");
  });

  it("says only merge conflict when the base branch is not stored yet", () => {
    expect(bannerFor(pr({ flags: ["conflict"] }))?.text).toBe("Merge conflict");
  });

  it("counts failing checks, in the singular for one", () => {
    expect(bannerFor(pr({ flags: ["ci-failing"], checks: { ...GREEN, fail: 2 } }))?.text).toBe("2 failing checks");
    expect(bannerFor(pr({ flags: ["ci-failing"], checks: { ...GREEN, fail: 1 } }))?.text).toBe("1 failing check");
  });

  it("names the first other needs-action flag in plain words", () => {
    const text = (flags: string[]) => bannerFor(pr({ flags }))?.text;
    expect(text(["merge-blocked"])).toBe("Merge blocked");
    expect(text(["no-reviewer"])).toBe("No reviewer");
    expect(text(["ci-cancelled"])).toBe("Checks cancelled");
    expect(text(["ci-absent"])).toBe("No checks");
    expect(text(["mergeable-unknown"])).toBe("Mergeability unknown");
    expect(text(["mergeable-unknown", "ci-cancelled"])).toBe("Mergeability unknown");
  });

  it("adds who requested changes when there is reviewer feedback", () => {
    expect(
      bannerFor(pr({ flags: ["conflict", "feedback"], baseRefName: "main", changesRequestedBy: ["hubber"] }))?.text,
    ).toBe("Merge conflict with main · hubber requested changes");
    expect(bannerFor(pr({ flags: ["ci-failing", "feedback"], checks: { ...GREEN, fail: 1 } }))?.text).toBe(
      "1 failing check · reviewer feedback",
    );
  });

  it("stands reviewer feedback alone when nothing else blocks", () => {
    expect(bannerFor(pr({ flags: ["feedback"], changesRequestedBy: ["hubber"] }))).toEqual({
      tone: "blocked",
      text: "hubber requested changes",
    });
    expect(bannerFor(pr({ flags: ["feedback"] }))?.text).toBe("Reviewer feedback");
  });

  it("says ready to merge in green", () => {
    expect(bannerFor(pr({ flags: ["merge-ready"], approvedBy: ["hubber"] }))).toEqual({
      tone: "ready",
      text: "Ready to merge",
    });
  });

  it("draws no banner for a run in flight or an unflagged pull request", () => {
    expect(bannerFor(pr({ flags: ["ci-pending"] }))).toBeNull();
    expect(bannerFor(pr())).toBeNull();
  });
});

describe("blockedStageOf", () => {
  it("blocks Checks for failing or cancelled checks", () => {
    expect(blockedStageOf(pr({ flags: ["ci-failing"] }))).toBe(1);
    expect(blockedStageOf(pr({ flags: ["ci-cancelled"] }))).toBe(1);
  });

  it("blocks Merge for a conflict or a blocked merge", () => {
    expect(blockedStageOf(pr({ flags: ["conflict"] }))).toBe(3);
    expect(blockedStageOf(pr({ flags: ["merge-blocked"] }))).toBe(3);
  });

  it("blocks Checks first when both are wrong, since that is the stage it is at", () => {
    expect(blockedStageOf(pr({ flags: ["conflict", "ci-failing"] }))).toBe(1);
  });

  it("blocks nothing otherwise", () => {
    expect(blockedStageOf(pr({ flags: ["feedback", "no-reviewer", "ci-absent", "ci-pending"] }))).toBeNull();
    expect(blockedStageOf(pr({ flags: ["merge-ready"] }))).toBeNull();
  });
});

describe("reviewersFor", () => {
  it("builds each reviewer's state from the row, one entry per login", () => {
    const reviewers = reviewersFor(
      pr({ waitingOn: ["octocat"], changesRequestedBy: ["hubber"], commentedBy: ["hubber", "acme-bot"] }),
    );
    expect(reviewers.map(({ login, state }) => [login, state])).toEqual([
      ["octocat", "pending"],
      ["hubber", "changes_requested"],
      ["acme-bot", "commented"],
    ]);
  });

  it("puts an approval above the comment every reviewer also counts as", () => {
    const reviewers = reviewersFor(pr({ approvedBy: ["hubber"], commentedBy: ["hubber"] }));
    expect(reviewers.map(({ login, state }) => [login, state])).toEqual([["hubber", "approved"]]);
  });

  it("shows a re-requested reviewer as pending, whatever they said before", () => {
    const reviewers = reviewersFor(pr({ waitingOn: ["hubber"], commentedBy: ["hubber"] }));
    expect(reviewers.map(({ login, state }) => [login, state])).toEqual([["hubber", "pending"]]);
  });

  it("links a user's avatar, and a team's to its organization", () => {
    const [user, team] = reviewersFor(pr({ waitingOn: ["octocat", "acme/reviewers"] }));
    expect(user).toEqual({
      login: "octocat",
      state: "pending",
      team: false,
      avatarUrl: "https://github.com/octocat.png?size=40",
    });
    expect(team).toEqual({
      login: "acme/reviewers",
      state: "pending",
      team: true,
      avatarUrl: "https://github.com/acme.png?size=40",
    });
  });

  it("is empty when nobody has been asked or has reviewed", () => {
    expect(reviewersFor(pr())).toEqual([]);
  });
});

describe("checksGlyph", () => {
  it("counts passing checks out of those that ran, leaving skips out", () => {
    expect(checksGlyph(GREEN)).toEqual({ tone: "passed", text: "4/4" });
  });

  it("counts failing checks when any fail", () => {
    expect(checksGlyph({ pass: 5, fail: 2, skip: 1, pending: 0, cancelled: 0, total: 8 })).toEqual({
      tone: "failed",
      text: "2/7 failing",
    });
  });

  it("marks checks still running", () => {
    expect(checksGlyph({ pass: 2, fail: 0, skip: 0, pending: 3, cancelled: 0, total: 5 })).toEqual({
      tone: "running",
      text: "2/5",
    });
  });

  it("is null when the pull request has no checks", () => {
    expect(checksGlyph({ pass: 0, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 0 })).toBeNull();
    expect(checksGlyph({ pass: 0, fail: 0, skip: 2, pending: 0, cancelled: 0, total: 2 })).toBeNull();
  });
});

describe("diffOf", () => {
  it("returns the line counts when both are stored", () => {
    expect(diffOf(pr({ additions: 128, deletions: 12 }))).toEqual({ additions: 128, deletions: 12 });
  });

  it("is null for a row stored before the counts were", () => {
    expect(diffOf(pr())).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { bannerFor, blockedStageOf, diffOf, reviewersFor } from "./row-status.js";
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
  const text = (overrides: Partial<ListedPr>) => bannerFor(pr(overrides))?.text;

  it("leads with a merge conflict, naming the base branch", () => {
    expect(bannerFor(pr({ flags: ["conflict", "ci-failing"], baseRefName: "main" }))).toEqual({
      tone: "blocked",
      text: "Merge conflict with main",
    });
    expect(text({ flags: ["conflict"], baseRefName: "trunk" })).toBe("Merge conflict with trunk");
    expect(text({ flags: ["conflict"] })).toBe("Merge conflict");
  });

  it("counts failing and cancelled checks out of those that ran", () => {
    expect(text({ flags: ["ci-failing"], checks: { ...GREEN, fail: 2 } })).toBe("2 of 4 checks failing");
    expect(text({ flags: ["ci-cancelled"], checks: { ...GREEN, cancelled: 1 } })).toBe("1 of 4 checks cancelled");
  });

  it("says plainly what each other blocker means", () => {
    expect(text({ flags: ["ci-absent"] })).toBe("No checks ran on the latest push");
    expect(text({ flags: ["no-reviewer"] })).toBe("No reviewer requested");
  });

  it("leads a blocked merge with the feedback left alongside the approval", () => {
    expect(
      bannerFor(pr({ flags: ["merge-blocked"], approvedBy: ["hubber"], notedBy: ["hubber"], unresolvedThreads: 1 })),
    ).toEqual({ tone: "blocked", text: "hubber approved with notes", detail: "1 unanswered comment" });
  });

  it("says GitHub refuses a merge it has not explained", () => {
    expect(bannerFor(pr({ flags: ["merge-blocked"], approvedBy: ["hubber"], unresolvedThreads: 2 }))).toEqual({
      tone: "blocked",
      text: "Approved, but GitHub won't merge it",
      detail: "a branch rule isn't met",
    });
  });

  it("puts the reviewers' feedback after a blocker as the detail", () => {
    expect(
      bannerFor(pr({ flags: ["conflict", "feedback"], baseRefName: "main", changesRequestedBy: ["hubber"] })),
    ).toEqual({ tone: "blocked", text: "Merge conflict with main", detail: "hubber requested changes" });
    expect(
      bannerFor(pr({ flags: ["ci-failing", "feedback"], checks: { ...GREEN, fail: 1 }, commentedBy: ["octocat"] })),
    ).toEqual({ tone: "blocked", text: "1 of 4 checks failing", detail: "octocat left review comments" });
  });

  it("names who requested changes, with the unresolved threads after", () => {
    expect(bannerFor(pr({ flags: ["feedback"], changesRequestedBy: ["hubber"], unresolvedThreads: 3 }))).toEqual({
      tone: "blocked",
      text: "hubber requested changes",
      detail: "3 unanswered comments",
    });
    expect(text({ flags: ["feedback"], changesRequestedBy: ["hubber", "octocat"] })).toBe(
      "hubber and octocat requested changes",
    );
  });

  it("names who reviewed with comments, leaving out those who approved", () => {
    expect(
      bannerFor(
        pr({
          flags: ["feedback"],
          commentedBy: ["octocat", "hubber"],
          approvedBy: ["hubber"],
          waitingOn: ["hubot"],
          unresolvedThreads: 7,
        }),
      ),
    ).toEqual({ tone: "blocked", text: "octocat left review comments", detail: "7 unanswered comments" });
  });

  it("names everyone waiting on a reply, most threads first, as comments when the kinds mix", () => {
    // An approval with notes and inline threads, and a comment-only review.
    expect(
      bannerFor(
        pr({
          flags: ["feedback"],
          approvedBy: ["hubber"],
          notedBy: ["hubber"],
          commentedBy: ["hubber", "octocat"],
          unresolvedThreads: 7,
          repliedThreads: 1,
          unansweredBy: ["hubber", "octocat"],
        }),
      ),
    ).toEqual({ tone: "blocked", text: "Comments from hubber and octocat", detail: "6 unanswered comments, 1 replied" });
    // Threads alone, from someone whose review was an approval.
    expect(text({ approvedBy: ["hubber"], unresolvedThreads: 2, unansweredBy: ["hubber"] })).toBe(
      "Comments from hubber",
    );
    // An approver with notes whose only thread is theirs too stays "approved with notes".
    expect(
      text({ approvedBy: ["hubber"], notedBy: ["hubber"], unresolvedThreads: 1, unansweredBy: ["hubber"] }),
    ).toBe("hubber approved with notes");
  });

  it("counts the threads you replied to apart from those still unanswered", () => {
    const feedback = { flags: ["feedback"], changesRequestedBy: ["hubber"], unresolvedThreads: 7 };
    expect(bannerFor(pr({ ...feedback, repliedThreads: 1 }))?.detail).toBe("6 unanswered comments, 1 replied");
    expect(bannerFor(pr({ ...feedback, repliedThreads: 7 }))?.detail).toBe("7 comments replied");
    // With no reviewer's review to name, replied threads leave nothing to say.
    expect(bannerFor(pr({ unresolvedThreads: 2, repliedThreads: 2 }))).toBeNull();
  });

  it("counts unanswered comments when no reviewer's review explains the row", () => {
    expect(bannerFor(pr({ unresolvedThreads: 2 }))).toEqual({ tone: "blocked", text: "2 unanswered comments" });
    expect(text({ unresolvedThreads: 3, repliedThreads: 2 })).toBe("1 unanswered comment");
    expect(text({ flags: ["ci-pending"], unresolvedThreads: 1 })).toBe("1 unanswered comment");
  });

  it("names notes left with an approval, or notes alone", () => {
    expect(text({ notedBy: ["hubber"], approvedBy: ["hubber"] })).toBe("hubber approved with notes");
    expect(text({ notedBy: ["hubber", "octocat", "hubot"] })).toBe("Review notes from hubber, octocat, and hubot");
    expect(bannerFor(pr({ notedBy: ["hubber"], unresolvedThreads: 2 }))?.detail).toBe("2 unanswered comments");
  });

  it("keeps a merge-ready banner green but names the feedback left with the approval", () => {
    expect(
      bannerFor(
        pr({ flags: ["merge-ready"], approvedBy: ["hubber"], notedBy: ["hubber"], unresolvedThreads: 3, unansweredBy: ["hubber"] }),
      ),
    ).toEqual({ tone: "ready", text: "Ready to merge", detail: "hubber approved with notes, 3 unanswered comments" });
    expect(bannerFor(pr({ flags: ["merge-ready"], approvedBy: ["hubber"], unresolvedThreads: 2 }))?.detail).toBe(
      "2 unanswered comments",
    );
    // Threads you replied to last leave nothing to name.
    expect(
      bannerFor(pr({ flags: ["merge-ready"], approvedBy: ["hubber"], unresolvedThreads: 2, repliedThreads: 2 }))?.detail,
    ).toBe("approved by hubber");
  });

  it("says ready to merge in green, with who approved or who is still to review", () => {
    expect(bannerFor(pr({ flags: ["merge-ready"], approvedBy: ["hubber"] }))).toEqual({
      tone: "ready",
      text: "Ready to merge",
      detail: "approved by hubber",
    });
    expect(bannerFor(pr({ flags: ["merge-ready"], approvedBy: ["hubber"], waitingOn: ["octocat"] }))?.detail).toBe(
      "octocat hasn't reviewed yet",
    );
  });

  it("says in blue who a re-review is waiting on", () => {
    expect(bannerFor(pr({ awaitingReReview: true, waitingOn: ["hubber"] }))).toEqual({
      tone: "info",
      text: "Waiting on hubber to re-review",
    });
  });

  it("says in blue that GitHub is still working out mergeability", () => {
    expect(bannerFor(pr({ flags: ["mergeable-unknown"] }))).toEqual({
      tone: "info",
      text: "GitHub is still checking for conflicts",
    });
    expect(text({ flags: ["mergeable-unknown", "ci-cancelled"], checks: { ...GREEN, cancelled: 1 } })).toBe(
      "1 of 4 checks cancelled",
    );
  });

  it("draws no banner for a run in flight, a first review not yet given, or an unflagged pull request", () => {
    expect(bannerFor(pr({ flags: ["ci-pending"] }))).toBeNull();
    expect(bannerFor(pr({ waitingOn: ["hubber"] }))).toBeNull();
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

  it("crosses out the stage of the problem the banner leads with", () => {
    // The banner leads with the conflict, so the cross is on Merge.
    expect(blockedStageOf(pr({ flags: ["conflict", "ci-failing"] }))).toBe(3);
    expect(blockedStageOf(pr({ flags: ["ci-failing", "merge-blocked"] }))).toBe(1);
    expect(blockedStageOf(pr({ flags: ["merge-blocked", "ci-cancelled"] }))).toBe(3);
    // Mergeability still being worked out is not a blocker, so the cancelled
    // checks lead and the cross is on Checks.
    expect(blockedStageOf(pr({ flags: ["mergeable-unknown", "ci-cancelled"] }))).toBe(1);
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

describe("diffOf", () => {
  it("returns the line counts when both are stored", () => {
    expect(diffOf(pr({ additions: 128, deletions: 12 }))).toEqual({ additions: 128, deletions: 12 });
  });

  it("is null for a row stored before the counts were", () => {
    expect(diffOf(pr())).toBeNull();
  });
});

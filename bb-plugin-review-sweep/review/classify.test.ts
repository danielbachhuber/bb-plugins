import { describe, expect, it } from "vitest";
import {
  checksOf,
  classify,
  classifyOne,
  lastReviewedAt,
  parseTime,
  requestedAt,
  requestedReviewers,
  reviewState,
  reviewersOf,
} from "./classify.js";
import {
  NOW,
  daysAgo,
  makePr,
  pendingRequest,
  reviewRequest,
  submittedReview,
  withChecks,
} from "./fixtures.js";

const ME = "hubot";

describe("parseTime", () => {
  it("returns null rather than NaN for missing or unparseable input", () => {
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime("")).toBeNull();
    expect(parseTime("not a date")).toBeNull();
  });
});

describe("requestedAt", () => {
  it("prefers the newest request naming me directly", () => {
    const pr = makePr({
      timelineItems: {
        nodes: [
          reviewRequest({ login: ME }, daysAgo(9)),
          reviewRequest({ login: "octocat" }, daysAgo(1)),
          reviewRequest({ login: ME }, daysAgo(3)),
        ],
      },
    });
    expect(requestedAt(pr, ME)).toBe(Date.parse(daysAgo(3)));
  });

  it("falls back to the newest request of any kind for a team request", () => {
    // A request reaching me through a team names the team, never my login, so
    // insisting on a direct match would age every team request from PR open.
    const pr = makePr({
      timelineItems: {
        nodes: [
          reviewRequest({ slug: "platform" }, daysAgo(6)),
          reviewRequest({ slug: "platform" }, daysAgo(2)),
        ],
      },
    });
    expect(requestedAt(pr, ME)).toBe(Date.parse(daysAgo(2)));
  });

  it("falls back to the pull request's own creation time with no timeline", () => {
    const pr = makePr({ timelineItems: { nodes: [] }, createdAt: daysAgo(11) });
    expect(requestedAt(pr, ME)).toBe(Date.parse(daysAgo(11)));
  });

  it("survives a null node and an unparseable timestamp", () => {
    const pr = makePr({
      timelineItems: { nodes: [null, { createdAt: "nonsense" }] },
      createdAt: daysAgo(5),
    });
    expect(requestedAt(pr, ME)).toBe(Date.parse(daysAgo(5)));
  });

  it("returns 0 when there is nothing to read at all", () => {
    expect(requestedAt({ createdAt: undefined, timelineItems: null }, ME)).toBe(0);
  });
});

describe("lastReviewedAt", () => {
  it("ignores reviews by anyone else", () => {
    const pr = makePr({
      reviews: { nodes: [submittedReview("APPROVED", "octocat", daysAgo(1))] },
    });
    expect(lastReviewedAt(pr, ME)).toBeNull();
  });

  it("ignores a PENDING review, which is an unsubmitted draft", () => {
    const pr = makePr({ reviews: { nodes: [submittedReview("PENDING", ME, daysAgo(1))] } });
    expect(lastReviewedAt(pr, ME)).toBeNull();
  });

  it("counts a DISMISSED review, because I still read the diff", () => {
    const pr = makePr({ reviews: { nodes: [submittedReview("DISMISSED", ME, daysAgo(4))] } });
    expect(lastReviewedAt(pr, ME)).toBe(Date.parse(daysAgo(4)));
  });

  it("takes the most recent of several of my reviews", () => {
    const pr = makePr({
      reviews: {
        nodes: [
          submittedReview("COMMENTED", ME, daysAgo(8)),
          submittedReview("CHANGES_REQUESTED", ME, daysAgo(2)),
          submittedReview("COMMENTED", ME, daysAgo(5)),
        ],
      },
    });
    expect(lastReviewedAt(pr, ME)).toBe(Date.parse(daysAgo(2)));
  });
});

describe("requestedReviewers", () => {
  it("renders me as \"you\" rather than repeating my login on every row", () => {
    const pr = makePr({ reviewRequests: { nodes: [pendingRequest({ login: ME })] } });
    expect(requestedReviewers(pr, ME)).toEqual(["you"]);
  });

  it("puts me first and sorts the rest", () => {
    const pr = makePr({
      reviewRequests: {
        nodes: [
          pendingRequest({ login: "mona" }),
          pendingRequest({ login: ME }),
          pendingRequest({ slug: "platform" }),
        ],
      },
    });
    expect(requestedReviewers(pr, ME)).toEqual(["you", "mona", "platform"]);
  });

  it("names a team by slug, which is what says a teammate could take it", () => {
    const pr = makePr({ reviewRequests: { nodes: [pendingRequest({ slug: "platform" })] } });
    expect(requestedReviewers(pr, ME)).toEqual(["platform"]);
  });

  it("omits me when the request only ever reached me through a team", () => {
    // reviewRequests names the team, not the member, so there is no "you" to
    // show — and the team slug is the more useful thing to display anyway.
    const pr = makePr({ reviewRequests: { nodes: [pendingRequest({ slug: "platform" })] } });
    expect(requestedReviewers(pr, ME)).not.toContain("you");
  });

  it("deduplicates and survives null or empty nodes", () => {
    const pr = makePr({
      reviewRequests: {
        nodes: [null, {}, pendingRequest({ login: "mona" }), pendingRequest({ login: "mona" })],
      },
    });
    expect(requestedReviewers(pr, ME)).toEqual(["mona"]);
  });

  it("is empty when the field is missing entirely", () => {
    expect(requestedReviewers(makePr({ reviewRequests: null }), ME)).toEqual([]);
  });
});

describe("reviewState", () => {
  it("is a first look when I have never reviewed", () => {
    expect(reviewState(null, NOW)).toBe("first-look");
  });

  it("is a re-review when my review predates the current request", () => {
    expect(reviewState(Date.parse(daysAgo(6)), Date.parse(daysAgo(2)))).toBe("re-review");
  });

  it("is a first look when I reviewed after the request", () => {
    // Reviewed after being asked means the ball is not in my court, so calling
    // it a re-review would misreport who is waiting.
    expect(reviewState(Date.parse(daysAgo(1)), Date.parse(daysAgo(4)))).toBe("first-look");
  });
});

describe("classifyOne", () => {
  it("returns null for a node missing the fields an action needs", () => {
    expect(classifyOne({ number: 1, url: "https://example.test" }, ME)).toBeNull();
    expect(classifyOne({ repository: { nameWithOwner: "acme/widgets" }, number: 1 }, ME)).toBeNull();
    expect(
      classifyOne({ repository: { nameWithOwner: "acme/widgets" }, url: "u" }, ME),
    ).toBeNull();
  });

  it("carries the author, draft state, and change size through", () => {
    const row = classifyOne(
      makePr({ isDraft: true, additions: 12, deletions: 300, changedFiles: 9 }),
      ME,
    );
    expect(row).toMatchObject({
      repo: "acme/widgets",
      number: 1,
      author: "octocat",
      isDraft: true,
      size: { additions: 12, deletions: 300, changedFiles: 9 },
    });
  });

  it("defaults a missing author to unknown rather than dropping the row", () => {
    expect(classifyOne(makePr({ author: null }), ME)?.author).toBe("unknown");
  });

  it("carries the comment count through, and reads a missing one as zero", () => {
    expect(classifyOne(makePr({ comments: { totalCount: 7 } }), ME)?.comments).toBe(7);
    expect(classifyOne(makePr({ comments: null }), ME)?.comments).toBe(0);
  });
});

describe("classify", () => {
  it("sorts oldest request first", () => {
    const rows = classify(
      [
        makePr({ number: 3, timelineItems: { nodes: [reviewRequest({ login: ME }, daysAgo(1))] } }),
        makePr({ number: 1, timelineItems: { nodes: [reviewRequest({ login: ME }, daysAgo(9))] } }),
        makePr({ number: 2, timelineItems: { nodes: [reviewRequest({ login: ME }, daysAgo(4))] } }),
      ],
      ME,
    );
    expect(rows.map((row) => row.number)).toEqual([1, 2, 3]);
  });

  it("breaks a timestamp tie deterministically by repo then number", () => {
    const at = { nodes: [reviewRequest({ login: ME }, daysAgo(2))] };
    const rows = classify(
      [
        makePr({ number: 7, repository: { nameWithOwner: "acme/zzz" }, timelineItems: at }),
        makePr({ number: 9, repository: { nameWithOwner: "acme/aaa" }, timelineItems: at }),
        makePr({ number: 2, repository: { nameWithOwner: "acme/aaa" }, timelineItems: at }),
      ],
      ME,
    );
    expect(rows.map((row) => `${row.repo}#${row.number}`)).toEqual([
      "acme/aaa#2",
      "acme/aaa#9",
      "acme/zzz#7",
    ]);
  });

  it("drops null and unusable nodes without failing the whole sweep", () => {
    expect(classify([null, { number: 1 }, makePr()], ME)).toHaveLength(1);
  });
});

describe("a request the viewer has already answered", () => {
  const VIEWER = "octocat";
  const T = (iso: string) => iso;

  function pr(overrides: Record<string, unknown> = {}) {
    return {
      repository: { nameWithOwner: "acme/widgets" },
      number: 42,
      title: "Add the widget endpoint",
      url: "https://github.com/acme/widgets/pull/42",
      author: { login: "hubber" },
      isDraft: false,
      createdAt: T("2026-01-01T00:00:00Z"),
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      reviews: { nodes: [] },
      reviewRequests: { nodes: [] },
      timelineItems: { nodes: [] },
      ...overrides,
    } as never;
  }

  const requested = (at: string, who: Record<string, string>) => ({
    createdAt: T(at),
    requestedReviewer: who,
  });
  const review = (at: string, login: string) => ({
    author: { login },
    state: "APPROVED",
    submittedAt: T(at),
  });

  it("drops a pull request the viewer approved after being asked", () => {
    // The exact shape of #5785: asked directly, approved, then a team the
    // viewer belongs to was added, which put it back in the search.
    const node = pr({
      timelineItems: {
        nodes: [
          requested("2026-01-02T00:00:00Z", { login: VIEWER }),
          requested("2026-01-03T00:00:00Z", { slug: "psi-committers" }),
        ],
      },
      reviews: { nodes: [review("2026-01-02T12:00:00Z", VIEWER)] },
    });
    expect(classifyOne(node, VIEWER)).toBeNull();
  });

  it("keeps a pull request the viewer has not reviewed", () => {
    const node = pr({
      timelineItems: { nodes: [requested("2026-01-02T00:00:00Z", { login: VIEWER })] },
    });
    expect(classifyOne(node, VIEWER)).not.toBeNull();
  });

  it("keeps it when the viewer was asked again after reviewing", () => {
    // A direct re-request is a new question, unlike a team being added.
    const node = pr({
      timelineItems: {
        nodes: [
          requested("2026-01-02T00:00:00Z", { login: VIEWER }),
          requested("2026-01-04T00:00:00Z", { login: VIEWER }),
        ],
      },
      reviews: { nodes: [review("2026-01-03T00:00:00Z", VIEWER)] },
    });
    const row = classifyOne(node, VIEWER);
    expect(row).not.toBeNull();
    expect(row!.state).toBe("re-review");
  });

  it("drops it when the viewer reviewed a team-only request", () => {
    const node = pr({
      timelineItems: { nodes: [requested("2026-01-02T00:00:00Z", { slug: "psi-committers" })] },
      reviews: { nodes: [review("2026-01-03T00:00:00Z", VIEWER)] },
    });
    expect(classifyOne(node, VIEWER)).toBeNull();
  });

  it("ignores other people's reviews", () => {
    const node = pr({
      timelineItems: { nodes: [requested("2026-01-02T00:00:00Z", { login: VIEWER })] },
      reviews: { nodes: [review("2026-01-03T00:00:00Z", "someone-else")] },
    });
    expect(classifyOne(node, VIEWER)).not.toBeNull();
  });
});

describe("checksOf", () => {
  it("sorts check run counts into pass, fail, skip, cancelled, and running", () => {
    const pr = makePr({
      commits: withChecks({
        SUCCESS: 8,
        NEUTRAL: 1,
        SKIPPED: 2,
        STALE: 1,
        FAILURE: 1,
        TIMED_OUT: 1,
        ACTION_REQUIRED: 1,
        STARTUP_FAILURE: 1,
        CANCELLED: 1,
        IN_PROGRESS: 2,
        QUEUED: 1,
        PENDING: 1,
        WAITING: 1,
        REQUESTED: 1,
      }),
    });
    expect(checksOf(pr)).toEqual({ pass: 8, skip: 4, fail: 4, cancelled: 1, pending: 6, total: 23 });
  });

  it("adds commit statuses to the check runs", () => {
    const pr = makePr({
      commits: withChecks({ SUCCESS: 3 }, { SUCCESS: 1, FAILURE: 1, ERROR: 1, PENDING: 1, EXPECTED: 1 }),
    });
    expect(checksOf(pr)).toEqual({ pass: 4, skip: 0, fail: 2, cancelled: 0, pending: 2, total: 8 });
  });

  it("leaves out states with no checks, and counts an unknown state as running rather than passing", () => {
    const pr = makePr({ commits: withChecks({ SUCCESS: 2, FAILURE: 0, COMPLETED: 1 }) });
    expect(checksOf(pr)).toEqual({ pass: 2, skip: 0, fail: 0, cancelled: 0, pending: 1, total: 3 });
  });

  it("is all zero when the commit has no checks or the rollup is missing", () => {
    const none = { pass: 0, skip: 0, fail: 0, cancelled: 0, pending: 0, total: 0 };
    expect(checksOf(makePr())).toEqual(none);
    expect(checksOf(makePr({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }))).toEqual(none);
    expect(checksOf(makePr({ commits: null }))).toEqual(none);
  });

  it("is stored on the classified row", () => {
    expect(classifyOne(makePr({ commits: withChecks({ SUCCESS: 5 }) }), ME)?.checks).toEqual({
      pass: 5,
      skip: 0,
      fail: 0,
      cancelled: 0,
      pending: 0,
      total: 5,
    });
  });
});

describe("reviewersOf", () => {
  const states = (pr: Parameters<typeof reviewersOf>[0]) =>
    reviewersOf(pr, ME).map(({ login, state }) => [login, state]);

  it("shows outstanding requests as pending, leaving me out", () => {
    const pr = makePr({
      reviewRequests: { nodes: [pendingRequest({ login: ME }), pendingRequest({ login: "hubber" })] },
    });
    expect(states(pr)).toEqual([["hubber", "pending"]]);
  });

  it("names a requested team org/team, with the repository owner's picture to show", () => {
    const pr = makePr({ reviewRequests: { nodes: [pendingRequest({ slug: "reviewers" })] } });
    expect(reviewersOf(pr, ME)).toEqual([{ login: "acme/reviewers", state: "pending", team: true }]);
  });

  it("takes each other reviewer's latest verdict, in the order they are owed", () => {
    const pr = makePr({
      author: { login: "mona" },
      reviewRequests: { nodes: [] },
      reviews: {
        nodes: [
          submittedReview("APPROVED", "hubber", daysAgo(5)),
          submittedReview("CHANGES_REQUESTED", "hubber", daysAgo(3)),
          submittedReview("COMMENTED", "acme-bot", daysAgo(2)),
          submittedReview("CHANGES_REQUESTED", "octocat", daysAgo(4)),
          submittedReview("APPROVED", "octocat", daysAgo(2)),
        ],
      },
    });
    expect(states(pr)).toEqual([
      ["hubber", "changes_requested"],
      ["octocat", "approved"],
      ["acme-bot", "commented"],
    ]);
  });

  it("shows a dismissed review after everyone else", () => {
    const pr = makePr({
      author: { login: "mona" },
      reviewRequests: { nodes: [] },
      reviews: {
        nodes: [
          submittedReview("APPROVED", "hubber", daysAgo(4)),
          submittedReview("DISMISSED", "hubber", daysAgo(1)),
          submittedReview("COMMENTED", "octocat", daysAgo(2)),
        ],
      },
    });
    expect(states(pr)).toEqual([
      ["octocat", "commented"],
      ["hubber", "dismissed"],
    ]);
  });

  it("keeps an approval over a later comment", () => {
    const pr = makePr({
      reviewRequests: { nodes: [] },
      reviews: {
        nodes: [submittedReview("APPROVED", "hubber", daysAgo(3)), submittedReview("COMMENTED", "hubber", daysAgo(1))],
      },
    });
    expect(states(pr)).toEqual([["hubber", "approved"]]);
  });

  it("shows a reviewer asked again as pending, whatever they said before", () => {
    const pr = makePr({
      reviewRequests: { nodes: [pendingRequest({ login: "hubber" })] },
      reviews: { nodes: [submittedReview("CHANGES_REQUESTED", "hubber", daysAgo(3))] },
    });
    expect(states(pr)).toEqual([["hubber", "pending"]]);
  });

  it("leaves out my own reviews, the author's replies, and drafts", () => {
    const pr = makePr({
      reviewRequests: { nodes: [] },
      reviews: {
        nodes: [
          submittedReview("APPROVED", ME, daysAgo(3)),
          submittedReview("COMMENTED", "octocat", daysAgo(2)),
          submittedReview("PENDING", "hubber", daysAgo(1)),
        ],
      },
    });
    expect(states(pr)).toEqual([]);
  });

  it("is stored on the classified row", () => {
    expect(classifyOne(makePr({ reviewRequests: { nodes: [pendingRequest({ login: "hubber" })] } }), ME)?.reviewers).toEqual(
      [{ login: "hubber", state: "pending", team: false }],
    );
  });
});

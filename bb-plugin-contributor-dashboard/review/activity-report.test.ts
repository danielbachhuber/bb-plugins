import { describe, expect, it } from "vitest";

import type {
  IssueTimelineItem,
  IssueWithActivity,
  PullRequestReview,
  PullRequestWithActivity,
  TimelineItem,
} from "../mirror/github";
import { activityReport, type ActivityReportInput } from "./activity-report";

// October 2026, in UTC, which vitest.config.ts pins as local time.
const PERIOD = {
  from: "2026-10-01",
  to: "2026-10-31",
  start: Date.parse("2026-10-01T00:00:00Z"),
  end: Date.parse("2026-11-01T00:00:00Z"),
};
const NOW = Date.parse("2026-11-02T12:00:00Z");

function review(login: string, submittedAt: string, state: PullRequestReview["state"] = "APPROVED"): PullRequestReview {
  return { id: `R_${login}_${submittedAt}`, state, submittedAt, createdAt: submittedAt, author: { __typename: "User", login } };
}

function requested(reviewer: { login: string } | { slug: string }, createdAt: string): TimelineItem {
  return {
    __typename: "ReviewRequestedEvent",
    id: `E_${JSON.stringify(reviewer)}_${createdAt}`,
    createdAt,
    actor: { login: "octocat" },
    requestedReviewer: "slug" in reviewer ? { __typename: "Team", slug: reviewer.slug } : { __typename: "User", ...reviewer },
  };
}

let nextId = 0;
function pr(overrides: Partial<PullRequestWithActivity> = {}): PullRequestWithActivity {
  nextId += 1;
  return {
    id: `PR_${nextId}`,
    number: 1800 + nextId,
    title: "Add retry to widget sync",
    url: `https://github.com/acme/widgets/pull/${1800 + nextId}`,
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-10-05T09:00:00Z",
    updatedAt: "2026-10-05T09:00:00Z",
    closedAt: null,
    mergedAt: null,
    assignees: [],
    author: { __typename: "User", login: "hubber" },
    reviews: [],
    timelineItems: [],
    ...overrides,
  };
}

function assignedEvent(login: string, createdAt: string, kind: "AssignedEvent" | "UnassignedEvent" = "AssignedEvent"): IssueTimelineItem {
  return { __typename: kind, id: `${kind}_${login}_${createdAt}`, createdAt, assignee: { login } };
}

function issue(overrides: Partial<IssueWithActivity> = {}): IssueWithActivity {
  nextId += 1;
  return {
    id: `I_${nextId}`,
    number: 900 + nextId,
    title: "Widgets drop the last row",
    url: `https://github.com/acme/widgets/issues/${900 + nextId}`,
    state: "OPEN",
    createdAt: "2026-10-02T09:00:00Z",
    updatedAt: "2026-10-02T09:00:00Z",
    closedAt: null,
    author: { __typename: "User", login: "octocat" },
    assignees: [],
    timelineItems: [],
    ...overrides,
  };
}

function report(overrides: Partial<ActivityReportInput> = {}) {
  return activityReport({
    repository: "acme/widgets",
    login: "hubber",
    period: PERIOD,
    pullRequests: [],
    issues: [],
    teams: new Map(),
    sync: { syncedAt: NOW - 60_000, backfillDone: true, staleAfterMs: 30 * 60_000 },
    now: NOW,
    ...overrides,
  });
}

describe("activityReport: their pull requests", () => {
  it("includes one opened and merged in the period, with its size, body, closing issues, and reviews", () => {
    const merged = pr({
      state: "MERGED",
      mergedAt: "2026-10-07T15:00:00Z",
      closedAt: "2026-10-07T15:00:00Z",
      additions: 120,
      deletions: 30,
      changedFiles: 4,
      body: "Retries the sync twice.",
      closingIssuesReferences: [{ number: 901 }],
      reviews: [
        review("octocat", "2026-10-06T10:00:00Z", "CHANGES_REQUESTED"),
        review("octocat", "2026-10-07T10:00:00Z"),
        review("hubber", "2026-10-06T11:00:00Z", "COMMENTED"), // their own reply, not a review of it
      ],
    });
    const { pullRequests, summary } = report({ pullRequests: [merged] });
    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0]).toMatchObject({
      number: merged.number,
      state: "MERGED",
      additions: 120,
      deletions: 30,
      changedFiles: 4,
      body: "Retries the sync twice.",
      closesIssues: [901],
      inPeriod: { opened: true, merged: true, closedUnmerged: false, reviewed: true },
    });
    expect(pullRequests[0].reviews).toEqual([
      { reviewer: "octocat", state: "CHANGES_REQUESTED", submittedAt: "2026-10-06T10:00:00Z", inPeriod: true },
      { reviewer: "octocat", state: "APPROVED", submittedAt: "2026-10-07T10:00:00Z", inPeriod: true },
    ]);
    expect(summary).toMatchObject({ pullRequestsOpened: 1, pullRequestsMerged: 1, reviewsReceived: 2 });
  });

  it("includes one opened before the period that merged in it, and says only the merge was in it", () => {
    const earlier = pr({ createdAt: "2026-09-20T09:00:00Z", state: "MERGED", mergedAt: "2026-10-03T09:00:00Z" });
    const [row] = report({ pullRequests: [earlier] }).pullRequests;
    expect(row.inPeriod).toEqual({ opened: false, merged: true, closedUnmerged: false, reviewed: false });
  });

  it("counts one closed without merging", () => {
    const closed = pr({ state: "CLOSED", closedAt: "2026-10-09T09:00:00Z" });
    const { pullRequests, summary } = report({ pullRequests: [closed] });
    expect(pullRequests[0].inPeriod.closedUnmerged).toBe(true);
    expect(summary).toMatchObject({ pullRequestsOpened: 1, pullRequestsMerged: 0, pullRequestsClosedUnmerged: 1 });
  });

  it("includes one opened earlier and still open that someone reviewed in the period", () => {
    const reviewed = pr({ createdAt: "2026-09-20T09:00:00Z", reviews: [review("octocat", "2026-10-12T09:00:00Z")] });
    const [row] = report({ pullRequests: [reviewed] }).pullRequests;
    expect(row.inPeriod).toEqual({ opened: false, merged: false, closedUnmerged: false, reviewed: true });
  });

  it("leaves out one with nothing in the period, and other people's", () => {
    const quiet = pr({ createdAt: "2026-09-01T09:00:00Z", state: "MERGED", mergedAt: "2026-09-02T09:00:00Z" });
    const theirs = pr({ author: { __typename: "User", login: "octocat" } });
    expect(report({ pullRequests: [quiet, theirs] }).pullRequests).toEqual([]);
  });

  it("gives null size and body for a row mirrored before the sync asked for them", () => {
    const [row] = report({ pullRequests: [pr()] }).pullRequests;
    expect(row).toMatchObject({ additions: null, deletions: null, changedFiles: null, body: null, closesIssues: [] });
  });
});

describe("activityReport: reviews they gave", () => {
  it("keeps every review in the period and counts a burst on one pull request on one day once", () => {
    const reviewed = pr({
      author: { __typename: "User", login: "octocat" },
      reviews: [
        review("hubber", "2026-10-06T10:00:00Z", "COMMENTED"),
        review("hubber", "2026-10-06T10:05:00Z", "COMMENTED"),
        review("hubber", "2026-10-08T10:00:00Z", "APPROVED"),
        review("hubber", "2026-09-30T10:00:00Z", "COMMENTED"), // before the period
        review("octocat", "2026-10-06T11:00:00Z", "COMMENTED"), // someone else
      ],
    });
    const { reviewsGiven, summary } = report({ pullRequests: [reviewed] });
    expect(reviewsGiven.map((r) => [r.submittedAt, r.state, r.counted])).toEqual([
      ["2026-10-06T10:00:00Z", "COMMENTED", true],
      ["2026-10-06T10:05:00Z", "COMMENTED", false],
      ["2026-10-08T10:00:00Z", "APPROVED", true],
    ]);
    expect(reviewsGiven[0].pullRequest).toEqual({
      number: reviewed.number,
      title: reviewed.title,
      url: reviewed.url,
      author: "octocat",
    });
    expect(summary).toMatchObject({ reviewsGiven: 2, reviewsGivenAll: 3, pullRequestsReviewed: 1 });
  });
});

describe("activityReport: review requests", () => {
  it("lists requests that named them in the period, with when they answered", () => {
    const asked = pr({
      author: { __typename: "User", login: "octocat" },
      timelineItems: [
        requested({ login: "hubber" }, "2026-10-06T09:00:00Z"),
        requested({ login: "octocat" }, "2026-10-06T09:00:00Z"),
        requested({ login: "hubber" }, "2026-09-20T09:00:00Z"), // before the period
      ],
      reviews: [review("hubber", "2026-10-07T09:00:00Z")],
    });
    const { reviewRequests } = report({ pullRequests: [asked] });
    expect(reviewRequests).toEqual([
      {
        pullRequest: { number: asked.number, title: asked.title, url: asked.url, author: "octocat" },
        requestedAt: "2026-10-06T09:00:00Z",
        requestedBy: "octocat",
        via: null,
        reviewedAt: "2026-10-07T09:00:00Z",
      },
    ]);
  });

  it("leaves reviewedAt empty when their only review came before the request", () => {
    const asked = pr({
      author: { __typename: "User", login: "octocat" },
      timelineItems: [requested({ login: "hubber" }, "2026-10-08T09:00:00Z")],
      reviews: [review("hubber", "2026-10-07T09:00:00Z", "COMMENTED")],
    });
    expect(report({ pullRequests: [asked] }).reviewRequests[0].reviewedAt).toBeNull();
  });

  it("lists a team request they picked up, naming the team", () => {
    const asked = pr({
      author: { __typename: "User", login: "octocat" },
      timelineItems: [requested({ slug: "widgets-core" }, "2026-10-06T09:00:00Z")],
      reviews: [review("hubber", "2026-10-06T15:00:00Z")],
    });
    const [row] = report({ pullRequests: [asked] }).reviewRequests;
    expect(row).toMatchObject({ via: "widgets-core", reviewedAt: "2026-10-06T15:00:00Z" });
  });

  it("lists what is waiting on their review now, whatever the period", () => {
    const waiting = pr({
      author: { __typename: "User", login: "octocat" },
      createdAt: "2026-08-01T09:00:00Z",
      timelineItems: [requested({ login: "hubber" }, "2026-08-02T09:00:00Z")],
    });
    const { awaitingReview, summary } = report({ pullRequests: [waiting] });
    expect(awaitingReview.map((row) => row.number)).toEqual([waiting.number]);
    expect(summary.awaitingReview).toBe(1);
  });
});

describe("activityReport: issues", () => {
  it("lists issues they opened in the period", () => {
    const theirs = issue({ author: { __typename: "User", login: "hubber" } });
    const before = issue({ author: { __typename: "User", login: "hubber" }, createdAt: "2026-09-01T09:00:00Z" });
    expect(report({ issues: [theirs, before] }).issues.opened.map((row) => row.number)).toEqual([theirs.number]);
  });

  it("lists an issue assigned to them in the period, with when", () => {
    const held = issue({
      assignees: [{ login: "hubber" }],
      timelineItems: [
        { __typename: "MilestonedEvent", id: "M_1", createdAt: "2026-10-03T09:00:00Z" },
        assignedEvent("hubber", "2026-10-04T09:00:00Z"),
      ],
    });
    const [row] = report({ issues: [held] }).issues.assigned;
    expect(row).toMatchObject({ number: held.number, plannedAt: "2026-10-03T09:00:00Z", assignedAt: "2026-10-04T09:00:00Z", assignedNow: true });
  });

  it("lists one held through the period from before it, and one assigned before the mirror kept events", () => {
    const longHeld = issue({
      createdAt: "2026-08-01T09:00:00Z",
      assignees: [{ login: "hubber" }],
      timelineItems: [assignedEvent("hubber", "2026-08-02T09:00:00Z")],
    });
    const noEvents = issue({ createdAt: "2026-07-01T09:00:00Z", assignees: [{ login: "hubber" }] });
    const assigned = report({ issues: [longHeld, noEvents] }).issues.assigned;
    expect(assigned.map((row) => [row.number, row.assignedAt])).toEqual([
      [noEvents.number, null],
      [longHeld.number, "2026-08-02T09:00:00Z"],
    ]);
  });

  it("leaves out one handed back before the period, and one closed before it", () => {
    const handedBack = issue({
      createdAt: "2026-08-01T09:00:00Z",
      timelineItems: [assignedEvent("hubber", "2026-08-02T09:00:00Z"), assignedEvent("hubber", "2026-09-02T09:00:00Z", "UnassignedEvent")],
    });
    const closedBefore = issue({
      createdAt: "2026-08-01T09:00:00Z",
      state: "CLOSED",
      closedAt: "2026-09-15T09:00:00Z",
      assignees: [{ login: "hubber" }],
    });
    expect(report({ issues: [handedBack, closedBefore] }).issues.assigned).toEqual([]);
  });

  it("counts an issue assigned to them that closed in the period", () => {
    const closed = issue({
      createdAt: "2026-09-01T09:00:00Z",
      state: "CLOSED",
      closedAt: "2026-10-20T09:00:00Z",
      assignees: [{ login: "hubber" }],
    });
    const { issues, summary } = report({ issues: [closed] });
    expect(issues.closedWhileAssigned.map((row) => row.number)).toEqual([closed.number]);
    expect(summary).toMatchObject({ issuesAssigned: 1, assignedIssuesClosed: 1 });
  });
});

describe("activityReport: the period and the mirror", () => {
  it("names the period's days and its local-midnight edges", () => {
    expect(report().period).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      start: "2026-10-01T00:00:00.000Z",
      end: "2026-11-01T00:00:00.000Z",
    });
  });

  it("counts a merge in the last minute of the last day, and not one at the midnight after", () => {
    const late = pr({ state: "MERGED", createdAt: "2026-09-01T09:00:00Z", mergedAt: "2026-10-31T23:59:00Z" });
    const after = pr({ state: "MERGED", createdAt: "2026-09-01T09:00:00Z", mergedAt: "2026-11-01T00:00:00Z" });
    expect(report({ pullRequests: [late, after] }).pullRequests.map((row) => row.number)).toEqual([late.number]);
  });

  it("says when the mirror last synced and whether that is stale", () => {
    expect(report().mirror).toEqual({ syncedAt: "2026-11-02T11:59:00.000Z", stale: false, backfillDone: true });
    const old = report({ sync: { syncedAt: NOW - 2 * 3_600_000, backfillDone: false, staleAfterMs: 30 * 60_000 } });
    expect(old.mirror).toMatchObject({ stale: true, backfillDone: false });
    expect(report({ sync: { syncedAt: null, backfillDone: false, staleAfterMs: 1 } }).mirror.syncedAt).toBeNull();
  });

  it("says whether the mirror has seen the login at all", () => {
    expect(report({ pullRequests: [pr()] }).known).toBe(true);
    expect(report({ pullRequests: [pr()], login: "nobody" }).known).toBe(false);
  });
});

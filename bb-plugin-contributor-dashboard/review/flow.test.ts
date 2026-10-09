import { describe, expect, it } from "vitest";

import type { IssueWithActivity, PullRequestWithActivity } from "../mirror/github";

import { issueFlow, pullRequestFlow } from "./flow";

const FROM = Date.parse("2026-09-01T00:00:00Z");
const TO = Date.parse("2026-10-01T00:00:00Z");

function pr(overrides: Partial<PullRequestWithActivity> = {}): PullRequestWithActivity {
  return {
    id: "PR_1",
    number: 1,
    title: "Export widgets as CSV",
    url: "https://github.com/acme/widgets/pull/1",
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-09-10T09:00:00Z",
    updatedAt: "2026-09-12T09:00:00Z",
    closedAt: null,
    mergedAt: null,
    assignees: [],
    author: { login: "octocat" },
    reviews: [],
    timelineItems: [],
    ...overrides,
  };
}

const asked = {
  __typename: "ReviewRequestedEvent" as const,
  id: "rr",
  createdAt: "2026-09-10T10:00:00Z",
  actor: { login: "octocat" },
  requestedReviewer: { __typename: "User", login: "hubber" },
};

const review = (state: "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED", login = "hubber") => ({
  id: `r-${state}-${login}`,
  state,
  submittedAt: "2026-09-11T09:00:00Z",
  createdAt: "2026-09-11T09:00:00Z",
  author: { login },
});

function issue(overrides: Partial<IssueWithActivity> = {}): IssueWithActivity {
  return {
    id: "I_1",
    number: 1,
    title: "Widgets lose their colour",
    url: "https://github.com/acme/widgets/issues/1",
    state: "OPEN",
    createdAt: "2026-09-10T09:00:00Z",
    updatedAt: "2026-09-12T09:00:00Z",
    closedAt: null,
    author: { login: "octocat" },
    assignees: [],
    timelineItems: [],
    ...overrides,
  };
}

const milestoned = { __typename: "MilestonedEvent" as const, id: "m", createdAt: "2026-09-11T09:00:00Z" };
const assigned = {
  __typename: "AssignedEvent" as const,
  id: "a",
  createdAt: "2026-09-12T09:00:00Z",
  assignee: { login: "hubber" },
};

describe("pullRequestFlow", () => {
  it("counts only what was opened in the period, and no bots", () => {
    const flow = pullRequestFlow(
      [
        pr(),
        pr({ createdAt: "2026-08-20T09:00:00Z" }),
        pr({ author: { __typename: "Bot", login: "renovate" } }),
      ],
      FROM,
      TO,
    );
    expect(flow.opened).toBe(1);
  });

  it("separates the paths a pull request can take to a merge", () => {
    const flow = pullRequestFlow(
      [
        pr({ timelineItems: [asked], reviews: [review("APPROVED")], mergedAt: "2026-09-12T09:00:00Z", state: "MERGED" }),
        pr({ reviews: [review("COMMENTED")] }),
        pr({ mergedAt: "2026-09-12T09:00:00Z", state: "MERGED", reviews: [review("APPROVED", "octocat")] }),
        pr({ timelineItems: [asked], reviews: [review("CHANGES_REQUESTED")], state: "CLOSED" }),
      ],
      FROM,
      TO,
    );
    expect(flow).toMatchObject({
      opened: 4,
      asked: 2,
      reviewedUnasked: 1,
      approved: 1,
      changesRequested: 1,
      merged: 2,
      // The author's own approval is not a review.
      mergedUnreviewed: 1,
      closed: 1,
    });
  });

  it("counts a pull request that was ever a draft", () => {
    const flow = pullRequestFlow(
      [
        pr({ isDraft: true }),
        pr({ timelineItems: [{ __typename: "ReadyForReviewEvent", id: "rfr", createdAt: "2026-09-11T09:00:00Z", actor: null }] }),
        pr(),
      ],
      FROM,
      TO,
    );
    expect(flow.drafted).toBe(2);
  });
});

describe("issueFlow", () => {
  it("separates an issue assigned from a plan from one assigned without", () => {
    const flow = issueFlow(
      [
        issue({ timelineItems: [milestoned, assigned], state: "CLOSED" }),
        issue({ timelineItems: [milestoned] }),
        issue({ timelineItems: [assigned], state: "CLOSED" }),
        issue({ state: "CLOSED" }),
        issue(),
      ],
      FROM,
      TO,
    );
    expect(flow).toEqual({
      opened: 5,
      planned: 2,
      assignedFromPlan: 1,
      assignedWithoutPlan: 1,
      closedAssigned: 2,
      closedPlanned: 0,
      closedUntriaged: 1,
    });
  });
});

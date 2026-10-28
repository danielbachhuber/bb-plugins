import { describe, expect, it } from "vitest";

import type { PullRequestReview, PullRequestWithActivity, TimelineItem } from "../mirror/github";
import { everyone } from "./everyone";

function review(login: string, submittedAt: string, typename = "User"): PullRequestReview {
  return { id: `R_${login}_${submittedAt}`, state: "APPROVED", submittedAt, createdAt: submittedAt, author: { __typename: typename, login } };
}

function requested(reviewer: { login?: string; slug?: string }, createdAt: string): TimelineItem {
  const requestedReviewer =
    reviewer.slug === undefined
      ? { __typename: "User", login: reviewer.login ?? "" }
      : { __typename: "Team" as const, slug: reviewer.slug };
  return { __typename: "ReviewRequestedEvent", id: `E_${createdAt}`, createdAt, actor: { login: "octocat" }, requestedReviewer };
}

function pr(
  author: string,
  createdAt: string,
  reviews: PullRequestReview[] = [],
  timelineItems: TimelineItem[] = [],
  authorType = "User",
): PullRequestWithActivity {
  return {
    id: `PR_${author}_${createdAt}`,
    number: 1,
    title: "Add retry to widget sync",
    url: "https://github.com/acme/widgets/pull/1",
    state: "OPEN",
    isDraft: false,
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    mergedAt: null,
    assignees: [],
    author: { __typename: authorType, login: author },
    reviews,
    timelineItems,
  };
}

describe("everyone", () => {
  it("lists authors, reviewers, and those asked to review, most recently active first", () => {
    expect(
      everyone([
        pr("octocat", "2026-09-01T00:00:00Z", [review("hubber", "2026-09-03T00:00:00Z")]),
        pr("monalisa", "2026-09-02T00:00:00Z", [], [requested({ login: "jetpacktocat" }, "2026-09-05T00:00:00Z")]),
      ]),
    ).toEqual(["jetpacktocat", "hubber", "monalisa", "octocat"]);
  });

  it("orders a person by their latest activity, and lists them once", () => {
    expect(
      everyone([
        pr("octocat", "2026-09-01T00:00:00Z"),
        pr("hubber", "2026-09-02T00:00:00Z"),
        pr("octocat", "2026-09-03T00:00:00Z"),
      ]),
    ).toEqual(["octocat", "hubber"]);
  });

  it("leaves out bots and teams", () => {
    expect(
      everyone([
        pr("dependabot", "2026-09-01T00:00:00Z", [review("ci-bot[bot]", "2026-09-02T00:00:00Z")], [requested({ slug: "acme/reviewers" }, "2026-09-02T00:00:00Z")], "Bot"),
      ]),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import type { PullRequestReview, PullRequestWithActivity, TimelineItem } from "../mirror/github";
import { bucketsFor } from "../dashboard/period";
import { peopleActivity } from "./people";

const NOW = Date.parse("2026-10-07T15:00:00Z"); // a Wednesday
const buckets = bucketsFor("6w", NOW); // weeks starting Aug 31 … Oct 5

function review(login: string, submittedAt: string, state: PullRequestReview["state"] = "APPROVED", typename = "User"): PullRequestReview {
  return { id: `R_${login}_${submittedAt}`, state, submittedAt, createdAt: submittedAt, author: { __typename: typename, login } };
}

function requested(reviewer: { login?: string; slug?: string; typename?: string }, createdAt: string): TimelineItem {
  const requestedReviewer =
    reviewer.slug === undefined
      ? { __typename: reviewer.typename ?? "User", login: reviewer.login ?? "" }
      : { __typename: "Team" as const, slug: reviewer.slug };
  return { __typename: "ReviewRequestedEvent", id: `E_${createdAt}`, createdAt, actor: { login: "octocat" }, requestedReviewer };
}

function pr(reviews: PullRequestReview[], timelineItems: TimelineItem[], author = "octocat"): PullRequestWithActivity {
  return {
    id: `PR_${Math.random()}`,
    number: 1,
    title: "Add retry to widget sync",
    url: "https://github.com/acme/widgets/pull/1",
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    closedAt: null,
    mergedAt: null,
    author: { __typename: "User", login: author },
    reviews,
    timelineItems,
  };
}

const byLogin = (prs: PullRequestWithActivity[]) =>
  Object.fromEntries(peopleActivity(prs, buckets).map((p) => [p.login, p]));

describe("peopleActivity", () => {
  it("counts a direct review request in the week it was made", () => {
    const hubber = byLogin([pr([], [requested({ login: "hubber" }, "2026-09-08T10:00:00Z")])]).hubber;
    expect(hubber.requested).toEqual([0, 1, 0, 0, 0, 0]);
    expect(hubber.requestedTotal).toBe(1);
  });

  it("counts each re-request again, since each asks for another review", () => {
    const hubber = byLogin([
      pr([], [requested({ login: "hubber" }, "2026-09-08T10:00:00Z"), requested({ login: "hubber" }, "2026-09-10T10:00:00Z")]),
    ]).hubber;
    expect(hubber.requestedTotal).toBe(2);
  });

  it("counts a review in the week it was submitted", () => {
    const hubber = byLogin([pr([review("hubber", "2026-10-06T09:00:00Z")], [])]).hubber;
    expect(hubber.given).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it("counts a person's reviews on one pull request on one day once", () => {
    const hubber = byLogin([
      pr(
        [
          review("hubber", "2026-09-08T09:00:00Z", "COMMENTED"),
          review("hubber", "2026-09-08T09:05:00Z", "COMMENTED"),
          review("hubber", "2026-09-08T16:00:00Z", "APPROVED"),
          review("hubber", "2026-09-09T09:00:00Z", "APPROVED"),
        ],
        [],
      ),
    ]).hubber;
    expect(hubber.givenTotal).toBe(2);
  });

  it("ignores pending reviews, the author's own replies, and bots", () => {
    const people = byLogin([
      pr(
        [
          review("hubber", "2026-09-08T09:00:00Z", "PENDING"),
          review("octocat", "2026-09-08T09:00:00Z", "COMMENTED"),
          review("copilot-pull-request-reviewer", "2026-09-08T09:00:00Z", "COMMENTED", "Bot"),
        ],
        [requested({ login: "copilot-pull-request-reviewer", typename: "Bot" }, "2026-09-08T08:00:00Z")],
      ),
    ]);
    expect(Object.keys(people)).toEqual([]);
  });

  it("credits a team request to the first person who reviews after it", () => {
    const people = byLogin([
      pr(
        [review("mona", "2026-09-09T09:00:00Z"), review("hubber", "2026-09-10T09:00:00Z")],
        [requested({ slug: "widgets-reviewers" }, "2026-09-08T10:00:00Z")],
      ),
    ]);
    expect(people.mona.requested).toEqual([0, 1, 0, 0, 0, 0]);
    expect(people.hubber.requestedTotal).toBe(0);
  });

  it("does not credit a team request to someone who was also asked directly", () => {
    const people = byLogin([
      pr(
        [review("mona", "2026-09-09T09:00:00Z")],
        [requested({ slug: "widgets-reviewers" }, "2026-09-08T10:00:00Z"), requested({ login: "mona" }, "2026-09-08T11:00:00Z")],
      ),
    ]);
    expect(people.mona.requestedTotal).toBe(1);
  });

  it("leaves a team request nobody picked up uncredited", () => {
    const people = byLogin([pr([], [requested({ slug: "widgets-reviewers" }, "2026-09-08T10:00:00Z")])]);
    expect(Object.keys(people)).toEqual([]);
  });

  it("leaves out activity outside the period", () => {
    const people = byLogin([pr([review("hubber", "2026-08-01T09:00:00Z")], [requested({ login: "hubber" }, "2026-08-01T08:00:00Z")])]);
    expect(Object.keys(people)).toEqual([]);
  });

  it("lists people alphabetically, ignoring case", () => {
    const logins = peopleActivity(
      [pr([review("yeti", "2026-09-08T09:00:00Z"), review("Hubber", "2026-09-08T09:00:00Z"), review("mona", "2026-09-08T09:00:00Z")], [])],
      buckets,
    ).map((p) => p.login);
    expect(logins).toEqual(["Hubber", "mona", "yeti"]);
  });
});

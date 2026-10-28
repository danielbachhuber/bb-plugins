import { describe, expect, it } from "vitest";

import type { PullRequestReview, PullRequestWithActivity, TimelineItem } from "../mirror/github";
import { bucketsFor, rangeOf } from "../dashboard/period";
import { stageSummaries } from "./stages";
import { awaitingTeamReview, teamActivity } from "./teams";

const NOW = Date.parse("2026-10-07T15:00:00Z"); // a Wednesday
const buckets = bucketsFor(rangeOf({ kind: "preset", id: "6w" }, NOW));
const MEMBERS = new Map([["reviewers", ["octocat", "hubber", "mona", "spacecat"]]]);

function review(login: string, submittedAt: string): PullRequestReview {
  return { id: `R_${login}_${submittedAt}`, state: "APPROVED", submittedAt, createdAt: submittedAt, author: { __typename: "User", login } };
}

function asked(who: string, createdAt: string, removed = false): TimelineItem {
  const requestedReviewer = who.startsWith("@")
    ? { __typename: "Team" as const, slug: who.slice(1) }
    : { __typename: "User", login: who };
  return {
    __typename: removed ? "ReviewRequestRemovedEvent" : "ReviewRequestedEvent",
    id: `E_${who}_${createdAt}`,
    createdAt,
    actor: { login: "webcat" },
    requestedReviewer,
  };
}

let next = 1;
function pr(
  timelineItems: TimelineItem[],
  reviews: PullRequestReview[] = [],
  extra: Partial<PullRequestWithActivity> = {},
): PullRequestWithActivity {
  const number = next++;
  return {
    id: `PR_${number}`,
    number,
    title: "Retry gadget sync",
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-09-28T09:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    closedAt: null,
    mergedAt: null,
    assignees: [],
    author: { __typename: "User", login: "webcat" },
    reviews,
    timelineItems,
    ...extra,
  };
}

describe("awaitingTeamReview", () => {
  it("lists what waits on a team the person is in with no review since, naming who else was asked", () => {
    const waiting = pr([asked("@reviewers", "2026-10-01T09:00:00Z"), asked("hubber", "2026-10-01T09:00:00Z")]);
    const rows = awaitingTeamReview([waiting], "octocat", MEMBERS, NOW);
    expect(rows).toMatchObject([{ number: waiting.number, teams: ["reviewers"], named: ["hubber"] }]);
    expect(rows[0].waitingDays).toBeCloseTo(4.25, 1);
  });

  it("leaves out a team request anyone has reviewed since, one withdrawn, their own, and drafts", () => {
    const prs = [
      pr([asked("@reviewers", "2026-10-01T09:00:00Z")], [review("hubber", "2026-10-02T09:00:00Z")]),
      pr([asked("@reviewers", "2026-10-01T09:00:00Z"), asked("@reviewers", "2026-10-01T10:00:00Z", true)]),
      pr([asked("@reviewers", "2026-10-01T09:00:00Z")], [], { author: { __typename: "User", login: "octocat" } }),
      pr([asked("@reviewers", "2026-10-01T09:00:00Z")], [], { isDraft: true }),
    ];
    expect(awaitingTeamReview(prs, "octocat", MEMBERS, NOW)).toEqual([]);
  });

  it("leaves out one that asks for them by name, which their own list holds, and teams they are not in", () => {
    const prs = [
      pr([asked("@reviewers", "2026-10-01T09:00:00Z"), asked("octocat", "2026-10-01T09:00:00Z")]),
      pr([asked("@gadgets", "2026-10-01T09:00:00Z")]),
    ];
    expect(awaitingTeamReview(prs, "octocat", MEMBERS, NOW)).toEqual([]);
  });
});

describe("teamActivity", () => {
  it("counts each team's requests, who picked them up, members who picked up none, and what waits now", () => {
    const prs = [
      pr([asked("@reviewers", "2026-09-29T09:00:00Z")], [review("octocat", "2026-09-29T15:00:00Z")], { state: "MERGED" }),
      pr([asked("@reviewers", "2026-09-30T09:00:00Z")], [review("octocat", "2026-10-01T09:00:00Z")], { state: "MERGED" }),
      pr([asked("@reviewers", "2026-10-01T09:00:00Z")], [review("hubber", "2026-10-01T10:00:00Z")], { state: "MERGED" }),
      pr([asked("@reviewers", "2026-10-06T09:00:00Z")]),
    ];
    expect(teamActivity(prs, buckets, MEMBERS)).toEqual([
      {
        slug: "reviewers",
        requested: 4,
        pickedUp: 3,
        median: 0.25,
        p90: 1,
        waiting: 1,
        pickups: [
          { login: "octocat", count: 2 },
          { login: "hubber", count: 1 },
          { login: "mona", count: 0 },
          { login: "spacecat", count: 0 },
        ],
      },
    ]);
  });
});

describe("Code review, by who was asked", () => {
  it("splits what waits and what left into asked of a team only and asked of a person", () => {
    const prs = [
      pr([asked("@reviewers", "2026-10-01T09:00:00Z")]),
      pr([asked("@reviewers", "2026-10-01T09:00:00Z"), asked("hubber", "2026-10-02T09:00:00Z")]),
      pr([asked("@reviewers", "2026-09-29T09:00:00Z")], [review("mona", "2026-09-29T15:00:00Z")], { state: "MERGED" }),
      pr([asked("dependabot", "2026-10-01T09:00:00Z")].map((item) => ({ ...item, requestedReviewer: { __typename: "Bot", login: "dependabot" } })) as TimelineItem[]),
    ];
    const review_ = stageSummaries({ pullRequests: prs, issues: [] }, buckets, NOW).find((stage) => stage.key === "review")!;
    expect(review_.waiting).toBe(3);
    expect(review_.byAsked?.team).toMatchObject({ waiting: 2, left: 1 });
    expect(review_.byAsked?.person).toMatchObject({ waiting: 1, left: 0 });
  });
});

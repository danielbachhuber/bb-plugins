import { describe, expect, it } from "vitest";

import type { IssueWithActivity, PullRequestReview, PullRequestWithActivity } from "../mirror/github";
import { activityDays } from "./activity-days";

// Local midnights, so the days line up wherever the tests run.
const MON = new Date(2026, 8, 14).getTime();
const at = (day: number, hour = 10) => new Date(2026, 8, 14 + day, hour).toISOString();
const END = new Date(2026, 8, 21).getTime();

function review(login: string, submittedAt: string, state: PullRequestReview["state"] = "APPROVED"): PullRequestReview {
  return { id: `R_${login}_${submittedAt}`, state, submittedAt, createdAt: submittedAt, author: { __typename: "User", login } };
}

function pr(overrides: Partial<PullRequestWithActivity> = {}): PullRequestWithActivity {
  return {
    id: "PR_1",
    number: 1840,
    title: "Add retry to widget sync",
    url: "https://github.com/acme/widgets/pull/1840",
    state: "OPEN",
    isDraft: false,
    createdAt: at(0),
    updatedAt: at(2),
    closedAt: null,
    mergedAt: null,
    assignees: [],
    author: { __typename: "User", login: "octocat" },
    reviews: [],
    timelineItems: [],
    ...overrides,
  };
}

function issue(number: number, overrides: Partial<IssueWithActivity> = {}): IssueWithActivity {
  return {
    id: `I_${number}`,
    number,
    title: `Widget issue ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    state: "OPEN",
    createdAt: at(1),
    updatedAt: at(1),
    closedAt: null,
    author: { login: "octocat" },
    assignees: [],
    timelineItems: [],
    ...overrides,
  };
}

describe("activityDays", () => {
  it("has one entry per local day of the period, starting at midnight", () => {
    const days = activityDays([], [], "octocat", MON, END);
    expect(days).toHaveLength(7);
    expect(days[0].start).toBe(MON);
    expect(days[6].start).toBe(new Date(2026, 8, 20).getTime());
  });

  it("counts their pull requests on the day each opened and merged", () => {
    const days = activityDays([pr({ state: "MERGED", mergedAt: at(3) }), pr({ author: { login: "hubber" } })], [], "octocat", MON, END);
    expect(days.map((day) => day.opened)).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(days.map((day) => day.merged)).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });

  it("counts reviews on other people's pull requests once per pull request per day", () => {
    const theirs = pr({
      author: { login: "hubber" },
      reviews: [
        review("octocat", at(1, 9)),
        review("octocat", at(1, 15)),
        review("octocat", at(2)),
        review("octocat", at(2, 11), "PENDING"),
        review("mona", at(2)),
      ],
    });
    const own = pr({ reviews: [review("octocat", at(4))] });
    const days = activityDays([theirs, own], [], "octocat", MON, END);
    expect(days.map((day) => day.reviewed)).toEqual([0, 1, 1, 0, 0, 0, 0]);
  });

  it("counts issues they opened, and assigned issues that closed", () => {
    const days = activityDays(
      [],
      [
        issue(1),
        issue(2, { author: { login: "hubber" }, state: "CLOSED", closedAt: at(5), assignees: [{ login: "octocat" }] }),
        issue(3, { author: { login: "hubber" }, state: "CLOSED", closedAt: at(5), assignees: [{ login: "mona" }] }),
      ],
      "octocat",
      MON,
      END,
    );
    expect(days.map((day) => day.issuesOpened)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(days.map((day) => day.issuesClosed)).toEqual([0, 0, 0, 0, 0, 1, 0]);
  });

  it("leaves out what happened outside the period", () => {
    const before = new Date(2026, 8, 13, 10).toISOString();
    const days = activityDays([pr({ createdAt: before })], [issue(1, { createdAt: new Date(2026, 8, 21, 10).toISOString() })], "octocat", MON, END);
    expect(days.every((day) => day.opened === 0 && day.issuesOpened === 0)).toBe(true);
  });
});

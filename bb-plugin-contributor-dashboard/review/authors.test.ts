import { describe, expect, it } from "vitest";

import type { PullRequestWithActivity } from "../mirror/github";
import { bucketsFor, rangeOf } from "../dashboard/period";
import { authorActivity } from "./authors";

const NOW = Date.parse("2026-10-07T15:00:00Z"); // a Wednesday
const buckets = bucketsFor(rangeOf({ kind: "preset", id: "6w" }, NOW)); // weeks starting Aug 31 … Oct 5

function pr(fields: Partial<PullRequestWithActivity> & { createdAt: string }): PullRequestWithActivity {
  return {
    id: `PR_${fields.createdAt}_${fields.author?.login ?? "octocat"}`,
    number: 1,
    title: "Add retry to widget sync",
    url: "https://github.com/acme/widgets/pull/1",
    state: "OPEN",
    isDraft: false,
    updatedAt: fields.createdAt,
    closedAt: null,
    mergedAt: null,
    author: { __typename: "User", login: "octocat" },
    reviews: [],
    timelineItems: [],
    ...fields,
  };
}

const byLogin = (prs: PullRequestWithActivity[]) =>
  Object.fromEntries(authorActivity(prs, buckets).map((author) => [author.login, author]));

describe("authorActivity", () => {
  it("counts a pull request in the week it was opened", () => {
    const octocat = byLogin([pr({ createdAt: "2026-09-08T10:00:00Z" })]).octocat;
    expect(octocat.opened).toEqual([0, 1, 0, 0, 0, 0]);
    expect(octocat.openedTotal).toBe(1);
  });

  it("counts a merge in the week it merged, not the week it opened", () => {
    const octocat = byLogin([
      pr({ createdAt: "2026-09-08T10:00:00Z", mergedAt: "2026-09-22T09:00:00Z", closedAt: "2026-09-22T09:00:00Z", state: "MERGED" }),
    ]).octocat;
    expect(octocat.opened).toEqual([0, 1, 0, 0, 0, 0]);
    expect(octocat.merged).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it("counts a merge of a pull request opened before the period", () => {
    const octocat = byLogin([
      pr({ createdAt: "2026-06-01T10:00:00Z", mergedAt: "2026-09-22T09:00:00Z", closedAt: "2026-09-22T09:00:00Z", state: "MERGED" }),
    ]).octocat;
    expect(octocat.openedTotal).toBe(0);
    expect(octocat.mergedTotal).toBe(1);
  });

  it("counts a pull request closed without merging as opened only", () => {
    const octocat = byLogin([
      pr({ createdAt: "2026-09-08T10:00:00Z", closedAt: "2026-09-09T09:00:00Z", state: "CLOSED" }),
    ]).octocat;
    expect(octocat.openedTotal).toBe(1);
    expect(octocat.mergedTotal).toBe(0);
  });

  it("keeps each person's own pull requests", () => {
    const people = byLogin([
      pr({ createdAt: "2026-09-08T10:00:00Z" }),
      pr({ createdAt: "2026-09-09T10:00:00Z", author: { __typename: "User", login: "hubber" } }),
    ]);
    expect(people.octocat.openedTotal).toBe(1);
    expect(people.hubber.openedTotal).toBe(1);
  });

  it("leaves out bots", () => {
    expect(byLogin([pr({ createdAt: "2026-09-08T10:00:00Z", author: { __typename: "Bot", login: "thehubbot" } })])).toEqual({});
  });

  it("leaves out a pull request from before the period that has not merged", () => {
    expect(byLogin([pr({ createdAt: "2026-06-01T10:00:00Z" })])).toEqual({});
  });
});

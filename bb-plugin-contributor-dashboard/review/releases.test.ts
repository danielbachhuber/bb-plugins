import { describe, expect, it } from "vitest";

import type { PullRequestWithActivity, Release } from "../mirror/github";

import { firstLineOf, kindOf, listedPullRequests, olderReleases, releaseSummaries } from "./releases";

const REPO = "acme/widgets";
const link = (n: number) => `[#${n}](https://github.com/${REPO}/pull/${n})`;

function pr(number: number, title: string, login = "octocat", reviewers: string[] = []): PullRequestWithActivity {
  return {
    id: `PR_${number}`,
    number,
    title,
    url: `https://github.com/${REPO}/pull/${number}`,
    state: "MERGED",
    isDraft: false,
    createdAt: "2026-09-01T09:00:00Z",
    updatedAt: "2026-09-02T09:00:00Z",
    closedAt: "2026-09-02T09:00:00Z",
    mergedAt: "2026-09-02T09:00:00Z",
    assignees: [],
    author: login.endsWith("[bot]") ? { __typename: "Bot", login } : { login },
    reviews: reviewers.map((reviewer, i) => ({
      id: `R_${number}_${i}`,
      state: "APPROVED" as const,
      submittedAt: "2026-09-02T08:00:00Z",
      createdAt: "2026-09-02T08:00:00Z",
      author: { login: reviewer },
    })),
    timelineItems: [],
  };
}

function release(tagName: string, publishedAt: string, description: string): Release {
  return {
    id: `RE_${tagName}`,
    tagName,
    name: tagName,
    url: `https://github.com/${REPO}/releases/tag/${tagName}`,
    isDraft: false,
    isPrerelease: false,
    createdAt: publishedAt,
    publishedAt,
    description,
  };
}

describe("kindOf", () => {
  it("reads the conventional-commit type, grouped", () => {
    expect(kindOf({ title: "feat(api): add gadgets", author: { login: "octocat" } })).toBe("feat");
    expect(kindOf({ title: "revert: undo the cache", author: { login: "octocat" } })).toBe("fix");
    expect(kindOf({ title: "perf!: faster search", author: { login: "octocat" } })).toBe("refactor");
    expect(kindOf({ title: "docs: explain sprockets", author: { login: "octocat" } })).toBe("chore");
    expect(kindOf({ title: "Make widgets blue", author: { login: "octocat" } })).toBe("none");
  });

  it("counts anything a bot opened as a dependency update", () => {
    expect(kindOf({ title: "build(deps): bump left-pad", author: { __typename: "Bot", login: "dependabot" } })).toBe("deps");
  });
});

describe("listedPullRequests", () => {
  it("reads only the Merged Pull Requests list when the notes have one", () => {
    const notes = `## Highlights\n* Faster ${link(3)}\n\n## Merged Pull Requests\n* feat: faster ${link(3)}\n* fix: thing ${link(4)}`;
    expect(listedPullRequests(notes, REPO)).toEqual([3, 4]);
  });

  it("reads the whole notes when there is no list, and ignores other repositories", () => {
    const notes = `Fixes:\n* fix: thing ${link(7)}\n* see [#9](https://github.com/acme/gadgets/pull/9)`;
    expect(listedPullRequests(notes, REPO)).toEqual([7]);
  });
});

describe("firstLineOf", () => {
  it("says what a revert did, rather than what it reverted", () => {
    expect(firstLineOf(`Fixes:\n* revert: undo the cache, which backs out ${link(6)}\n* fix: other`)).toBe(
      "revert: undo the cache, which backs out #6",
    );
  });

  it("takes the first pull request in the list, without its trailing link", () => {
    expect(firstLineOf(`* **A note** above\n\n## Merged Pull Requests\n\n* fix(api): keep gadgets ${"(" + link(8) + ")"}`)).toBe(
      "fix(api): keep gadgets",
    );
  });
});

describe("releaseSummaries", () => {
  const prs = [
    pr(1, "feat: gadgets", "octocat", ["hubber"]),
    pr(2, "fix: widgets", "hubber", ["octocat", "octocat"]),
    pr(3, "build(deps): bump", "dependabot[bot]", ["hubber"]),
    pr(4, "fix: gadgets again", "mona"),
  ];
  const releases = [
    release("v2.1.1", "2026-09-04T10:00:00Z", `Fixes:\n* ${link(4)}`),
    release("v2.1.0", "2026-09-03T10:00:00Z", `## Merged Pull Requests\n* ${link(1)}\n* ${link(2)}\n* ${link(3)}\n* ${link(99)}`),
    release("v2.0.0", "2026-08-01T10:00:00Z", `## Merged Pull Requests\n* ${link(1)}`),
  ];
  const result = releaseSummaries(releases, prs, REPO, Date.parse("2026-09-01T00:00:00Z"), Date.parse("2026-10-01T00:00:00Z"));

  it("counts what each minor lists, and who", () => {
    expect(result.published).toBe(2);
    expect(result.patches).toBe(1);
    expect(result.older).toBe(1);
    expect(result.minors.map((m) => m.tag)).toEqual(["v2.1.0"]);
    const [minor] = result.minors;
    expect(minor.total).toBe(3);
    expect(minor.missing).toBe(1);
    expect(minor.kinds).toMatchObject({ feat: 1, fix: 1, deps: 1 });
    expect(minor.bot).toBe(1);
    // octocat reviewed #2 twice, which counts once.
    expect(minor.people).toEqual([
      { login: "hubber", merged: 1, reviews: 2 },
      { login: "octocat", merged: 1, reviews: 1 },
    ]);
  });

  it("groups a patch under its minor, with what it fixed", () => {
    const [patch] = result.minors[0].patches;
    expect(patch.tag).toBe("v2.1.1");
    expect(patch.total).toBe(1);
    expect(patch.firstLine).toBe("#4");
  });
});

describe("olderReleases", () => {
  const releases = [
    release("v3.2.0", "2026-09-20T10:00:00Z", ""),
    release("v3.1.1", "2026-09-14T10:00:00Z", ""),
    release("v3.1.0", "2026-09-13T10:00:00Z", ""),
    release("v3.0.0", "2026-09-06T10:00:00Z", ""),
  ];

  it("reads the minors before a date in batches, each with its patches", () => {
    const first = olderReleases(releases, [], REPO, Date.parse("2026-09-20T00:00:00Z"), 1);
    expect(first.minors.map((m) => m.tag)).toEqual(["v3.1.0"]);
    expect(first.minors[0].patches.map((p) => p.tag)).toEqual(["v3.1.1"]);
    expect(first.more).toBe(true);
    const next = olderReleases(releases, [], REPO, Date.parse(first.minors[0].publishedAt), 1);
    expect(next.minors.map((m) => m.tag)).toEqual(["v3.0.0"]);
    expect(next.more).toBe(false);
  });
});

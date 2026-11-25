import { describe, expect, it } from "vitest";

import { addedAt, fetchMilestones, RepositoryNotFoundError, standingOf, type RawIssue, type RawMilestone } from "./github.js";

function issue(overrides: Partial<RawIssue> = {}): RawIssue {
  return {
    number: 1,
    title: "Fix the widget",
    url: "https://github.com/acme/widgets/issues/1",
    state: "OPEN",
    stateReason: null,
    createdAt: "2026-10-01T00:00:00Z",
    closedAt: null,
    assignees: { nodes: [] },
    timelineItems: { nodes: [] },
    closedByPullRequestsReferences: { nodes: [] },
    ...overrides,
  };
}

describe("standingOf", () => {
  it("reads nobody, then assigned, from the assignees", () => {
    expect(standingOf(issue())).toBe("nobody");
    expect(standingOf(issue({ assignees: { nodes: [{ login: "octocat" }] } }))).toBe("assigned");
  });

  it("takes the furthest open pull request that closes it", () => {
    const prs = [
      { state: "OPEN", isDraft: true, reviewDecision: null },
      { state: "OPEN", isDraft: false, reviewDecision: "APPROVED" },
      { state: "MERGED", isDraft: false, reviewDecision: null },
    ];
    expect(standingOf(issue({ closedByPullRequestsReferences: { nodes: prs } }))).toBe("approved");
    expect(standingOf(issue({ closedByPullRequestsReferences: { nodes: [prs[0]] } }))).toBe("draft");
    expect(
      standingOf(
        issue({ closedByPullRequestsReferences: { nodes: [{ state: "OPEN", isDraft: false, reviewDecision: "REVIEW_REQUIRED" }] } }),
      ),
    ).toBe("review");
  });

  it("ignores a pull request that is no longer open", () => {
    const prs = [{ state: "CLOSED", isDraft: false, reviewDecision: "APPROVED" }];
    expect(standingOf(issue({ closedByPullRequestsReferences: { nodes: prs } }))).toBe("nobody");
  });
});

describe("addedAt", () => {
  it("is the last time it joined a milestone with this title", () => {
    const events = [
      { createdAt: "2026-10-02T00:00:00Z", milestoneTitle: "1.0" },
      { createdAt: "2026-10-05T00:00:00Z", milestoneTitle: "2.0" },
      { createdAt: "2026-10-03T00:00:00Z", milestoneTitle: "1.0" },
    ];
    expect(addedAt(issue({ timelineItems: { nodes: events } }), "1.0")).toBe(Date.parse("2026-10-03T00:00:00Z"));
  });

  it("falls back to any milestone event when the milestone was renamed", () => {
    const events = [{ createdAt: "2026-10-04T00:00:00Z", milestoneTitle: "Old name" }];
    expect(addedAt(issue({ timelineItems: { nodes: events } }), "New name")).toBe(Date.parse("2026-10-04T00:00:00Z"));
  });

  it("is the issue's creation when it was created in the milestone", () => {
    expect(addedAt(issue(), "1.0")).toBe(Date.parse("2026-10-01T00:00:00Z"));
  });
});

describe("fetchMilestones", () => {
  const milestone = (number: number, count: number): RawMilestone => ({
    number,
    title: `Release ${number}`,
    url: `https://github.com/acme/widgets/milestone/${number}`,
    dueOn: null,
    createdAt: "2026-09-01T00:00:00Z",
    openIssues: { totalCount: count },
    closedIssues: { totalCount: 0 },
  });
  const issuesPage = (numbers: number[], next: string | null) => ({
    repository: {
      milestone: {
        issues: { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes: numbers.map((number) => issue({ number })) },
      },
    },
  });

  it("pages through milestones, and through each one's issues, skipping an empty one", async () => {
    const calls: string[][] = [];
    const answers = [
      { repository: { nameWithOwner: "acme/Widgets", milestones: { pageInfo: { hasNextPage: true, endCursor: "m1" }, nodes: [milestone(1, 2)] } } },
      issuesPage([1], "i1"),
      issuesPage([2], null),
      { repository: { nameWithOwner: "acme/Widgets", milestones: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [milestone(2, 0)] } } },
    ];
    const gh = {
      async run(args: string[]) {
        calls.push(args);
        return JSON.stringify({ data: answers.shift() });
      },
    };
    const result = await fetchMilestones(gh, "acme/widgets");
    expect(calls).toHaveLength(4);
    expect(calls[2]).toContain("after=i1");
    expect(calls[3]).toContain("after=m1");
    expect(result.map((m) => [m.repo, m.number, m.issues.map((i) => i.number)])).toEqual([
      ["acme/Widgets", 1, [1, 2]],
      ["acme/Widgets", 2, []],
    ]);
  });

  it("refuses a repository name that is not a slug", async () => {
    await expect(fetchMilestones({ run: async () => "" }, "acme/widgets; rm -rf")).rejects.toThrow("not a repository");
  });

  it("tells a repository GitHub cannot find from other errors", async () => {
    const notFound = { run: async () => JSON.stringify({ data: { repository: null }, errors: [{ type: "NOT_FOUND", message: "Could not resolve" }] }) };
    await expect(fetchMilestones(notFound, "acme/widgets")).rejects.toBeInstanceOf(RepositoryNotFoundError);
    const other = { run: async () => JSON.stringify({ errors: [{ message: "Something went wrong" }] }) };
    await expect(fetchMilestones(other, "acme/widgets")).rejects.not.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("reads the response gh prints before exiting non-zero", async () => {
    const gh = {
      async run(): Promise<string> {
        throw Object.assign(new Error("Command failed"), {
          stdout: JSON.stringify({ data: { repository: null }, errors: [{ type: "NOT_FOUND", message: "Could not resolve" }] }),
        });
      },
    };
    await expect(fetchMilestones(gh, "acme/widgets")).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("retries once after a 502", async () => {
    let calls = 0;
    const gh = {
      async run(): Promise<string> {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("Command failed"), { stderr: "gh: HTTP 502" });
        return JSON.stringify({ data: { repository: { nameWithOwner: "acme/widgets", milestones: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } });
      },
    };
    expect(await fetchMilestones(gh, "acme/widgets")).toEqual([]);
    expect(calls).toBe(2);
  });
});

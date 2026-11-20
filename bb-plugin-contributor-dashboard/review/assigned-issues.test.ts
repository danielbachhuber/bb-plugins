import { describe, expect, it } from "vitest";

import type { IssueTimelineItem, IssueWithActivity } from "../mirror/github";

import { assignedIssues, closedAssignedIssues } from "./assigned-issues";

function issue(number: number, overrides: Partial<IssueWithActivity> = {}): IssueWithActivity {
  return {
    id: `I_${number}`,
    number,
    title: `Widget issue ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    state: "OPEN",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-09-01T09:00:00Z",
    closedAt: null,
    author: { login: "hubber" },
    assignees: [{ login: "octocat" }],
    timelineItems: [],
    ...overrides,
  };
}

const assigned = (createdAt: string, login = "octocat"): IssueTimelineItem => ({
  __typename: "AssignedEvent",
  id: `A_${createdAt}_${login}`,
  createdAt,
  assignee: { login },
});

const milestoned = (createdAt: string): IssueTimelineItem => ({ __typename: "MilestonedEvent", id: `M_${createdAt}`, createdAt });

describe("assignedIssues", () => {
  it("keeps open issues assigned to them now, longest held first", () => {
    const rows = assignedIssues(
      [
        issue(1, { timelineItems: [assigned("2026-09-20T09:00:00Z")] }),
        issue(2, { timelineItems: [assigned("2026-07-01T09:00:00Z")] }),
        issue(3, { state: "CLOSED", closedAt: "2026-09-02T09:00:00Z" }),
        issue(4, { assignees: [{ login: "mona" }] }),
      ],
      "octocat",
    );
    expect(rows.map((row) => row.number)).toEqual([2, 1]);
  });

  it("reads when it was planned and when it became theirs", () => {
    const [row] = assignedIssues(
      [issue(5, { timelineItems: [milestoned("2026-06-03T09:00:00Z"), assigned("2026-08-10T09:00:00Z")] })],
      "octocat",
    );
    expect(row).toMatchObject({
      author: "hubber",
      openedAt: "2026-06-01T09:00:00Z",
      plannedAt: "2026-06-03T09:00:00Z",
      assignedAt: "2026-08-10T09:00:00Z",
      updatedAt: "2026-09-01T09:00:00Z",
    });
  });

  it("counts from the last time it was assigned to them, not to someone else", () => {
    const [row] = assignedIssues(
      [
        issue(6, {
          timelineItems: [
            assigned("2026-06-05T09:00:00Z"),
            assigned("2026-07-05T09:00:00Z", "mona"),
            assigned("2026-08-05T09:00:00Z"),
          ],
        }),
      ],
      "octocat",
    );
    expect(row.assignedAt).toBe("2026-08-05T09:00:00Z");
  });

  it("falls back to when it was opened when no assignment event was kept", () => {
    const [row] = assignedIssues([issue(7)], "octocat");
    expect(row).toMatchObject({ plannedAt: null, assignedAt: "2026-06-01T09:00:00Z" });
  });
});

describe("assignedIssues for a team", () => {
  it("lists an issue two members hold once, naming both, held from the earlier assignment", () => {
    const rows = assignedIssues(
      [
        issue(1, {
          assignees: [{ login: "mona" }, { login: "octocat" }, { login: "yeti" }],
          timelineItems: [assigned("2026-08-01T09:00:00Z", "mona"), assigned("2026-07-01T09:00:00Z", "octocat")],
        }),
        issue(2, { assignees: [{ login: "yeti" }] }),
      ],
      new Set(["octocat", "mona"]),
    );
    expect(rows).toMatchObject([{ number: 1, holders: ["mona", "octocat"], assignedAt: "2026-07-01T09:00:00Z" }]);
  });

  it("counts an issue two members held as one closed", () => {
    const closed = issue(3, { state: "CLOSED", closedAt: "2026-09-02T09:00:00Z", assignees: [{ login: "mona" }, { login: "octocat" }] });
    expect(closedAssignedIssues([closed], new Set(["octocat", "mona"]), 0, Date.parse("2026-10-01T00:00:00Z"))).toBe(1);
  });
});

describe("closedAssignedIssues", () => {
  const start = Date.parse("2026-09-01T00:00:00Z");
  const end = Date.parse("2026-10-01T00:00:00Z");

  it("counts issues of theirs that closed inside the period", () => {
    expect(
      closedAssignedIssues(
        [
          issue(1, { state: "CLOSED", closedAt: "2026-09-10T09:00:00Z" }),
          issue(2, { state: "CLOSED", closedAt: "2026-08-10T09:00:00Z" }),
          issue(3, { state: "CLOSED", closedAt: "2026-09-12T09:00:00Z", assignees: [{ login: "mona" }] }),
          issue(4),
        ],
        "octocat",
        start,
        end,
      ),
    ).toBe(1);
  });
});

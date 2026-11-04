import { describe, expect, it } from "vitest";

import type { Issue } from "../mirror/github";
import { bucketsFor } from "../dashboard/period";

import { closedIssues } from "./closed-issues";

// Three Monday-to-Monday weeks, drawn by week.
const BUCKETS = bucketsFor({ from: Date.parse("2026-09-07T00:00:00"), to: Date.parse("2026-09-28T00:00:00") }, "week");

let next = 1;
function issue(overrides: Partial<Issue>): Issue {
  const number = next++;
  return {
    id: `I_${number}`,
    number,
    title: "Widgets wobble",
    url: `https://github.com/acme/widgets/issues/${number}`,
    state: "CLOSED",
    createdAt: "2026-09-01T09:00:00",
    updatedAt: "2026-09-08T09:00:00",
    closedAt: "2026-09-08T09:00:00",
    author: { login: "octocat" },
    assignees: [],
    stateReason: "COMPLETED",
    issueType: null,
    ...overrides,
  };
}

describe("closedIssues", () => {
  it("counts completed issues by type in the week they closed", () => {
    const result = closedIssues(
      [
        issue({ issueType: { name: "Bug" } }),
        issue({ issueType: { name: "Bug" }, closedAt: "2026-09-15T09:00:00" }),
        issue({ issueType: { name: "Task" }, closedAt: "2026-09-22T09:00:00" }),
        issue({}),
      ],
      BUCKETS,
    );
    expect(result.types).toEqual([
      { name: "Bug", completed: [1, 1, 0] },
      { name: "Task", completed: [0, 0, 1] },
      { name: null, completed: [1, 0, 0] },
    ]);
  });

  it("counts not planned and duplicate apart, whatever their type", () => {
    const result = closedIssues(
      [
        issue({ stateReason: "NOT_PLANNED", issueType: { name: "Bug" } }),
        issue({ stateReason: "NOT_PLANNED" }),
        issue({ stateReason: "DUPLICATE", closedAt: "2026-09-15T09:00:00" }),
      ],
      BUCKETS,
    );
    expect(result.types).toEqual([]);
    expect(result.notPlanned).toEqual([2, 0, 0]);
    expect(result.duplicate).toEqual([0, 1, 0]);
  });

  it("leaves out open issues, reopened ones, and closes outside the period", () => {
    const result = closedIssues(
      [
        issue({ state: "OPEN", closedAt: null, stateReason: null }),
        issue({ state: "OPEN", stateReason: "REOPENED" }),
        issue({ closedAt: "2026-09-01T09:00:00" }),
        issue({ closedAt: "2026-09-29T09:00:00" }),
      ],
      BUCKETS,
    );
    expect(result.types).toEqual([]);
    expect(result.notPlanned).toEqual([0, 0, 0]);
  });

  it("counts an issue mirrored before the new fields as completed with no type", () => {
    const { stateReason: _reason, issueType: _type, ...old } = issue({});
    expect(closedIssues([old], BUCKETS).types).toEqual([{ name: null, completed: [1, 0, 0] }]);
  });
});

import { describe, expect, it } from "vitest";

import type { PersonActivityResult } from "@/dashboard/contract";

import { summary } from "./person-view";

const SIX_WEEKS = { kind: "preset", id: "6w" } as const;

function person(started: number[], givenTotal: number | null, issues: { held?: number; closed?: number } = {}): PersonActivityResult {
  const flows = { started, finished: [], flows: [], fromEarlier: [], open: [], asked: null, median: 0, p90: 0 };
  return {
    repository: "acme/widgets",
    login: "octocat",
    buckets: [],
    authorFlows: flows,
    activity: givenTotal === null ? null : { login: "octocat", requested: [], pickedUp: [], given: [], requestedTotal: 0, pickedUpTotal: 0, givenTotal },
    awaiting: [],
    teamAwaiting: [],
    organization: "acme",
    assignedIssues: Array.from({ length: issues.held ?? 0 }, (_, i) => ({
      number: i + 1,
      title: `Widget issue ${i + 1}`,
      url: `https://github.com/acme/widgets/issues/${i + 1}`,
      author: "octocat",
      threadId: null,
      openedAt: "2026-09-01T09:00:00Z",
      plannedAt: null,
      assignedAt: "2026-09-01T09:00:00Z",
      updatedAt: "2026-09-01T09:00:00Z",
    })),
    issuesClosed: issues.closed ?? 0,
    activityDays: [],
    authored: [],
    authoredTotal: 0,
    authoredFacets: { open: 0, draft: 0, merged: 0, closed: 0 },
    authoredPaging: { page: 0, pages: 1, from: 0, to: 0, total: 0 },
    everyone: [],
    sync: { syncedAt: 0, running: false, backfillDone: true, pullRequests: 0, issues: 0, error: null },
  };
}

describe("summary", () => {
  it("totals the pull requests opened across the span", () => {
    expect(summary(person([3, 0, 4], 19), SIX_WEEKS)).toBe("Opened 7 pull requests and gave 19 reviews over six weeks");
  });

  it("names one of each in the singular", () => {
    expect(summary(person([1], 1), SIX_WEEKS)).toBe("Opened 1 pull request and gave 1 review over six weeks");
  });

  it("counts no reviews for someone with no review activity", () => {
    expect(summary(person([2], null), SIX_WEEKS)).toBe("Opened 2 pull requests and gave 0 reviews over six weeks");
  });

  it("leads with the open issues they hold and counts the ones of theirs that closed", () => {
    expect(summary(person([3], 4, { held: 15, closed: 42 }), SIX_WEEKS)).toBe(
      "Has 15 open issues · closed 42 issues assigned to them, opened 3 pull requests and gave 4 reviews over six weeks",
    );
  });

  it("names one open issue in the singular, and leaves out a closed count of nothing", () => {
    expect(summary(person([2], 1, { held: 1 }), SIX_WEEKS)).toBe(
      "Has 1 open issue · opened 2 pull requests and gave 1 review over six weeks",
    );
  });

  it("starts with what they did when they hold no issues", () => {
    expect(summary(person([2], 1, { closed: 3 }), SIX_WEEKS)).toBe(
      "Closed 3 issues assigned to them, opened 2 pull requests and gave 1 review over six weeks",
    );
  });
});

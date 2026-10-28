import { describe, expect, it } from "vitest";

import type { PersonActivityResult } from "@/dashboard/contract";

import { summary } from "./person-view";

const SIX_WEEKS = { kind: "preset", id: "6w" } as const;

function person(started: number[], givenTotal: number | null): PersonActivityResult {
  const flows = { started, finished: [], flows: [], fromEarlier: [], open: [], asked: null, median: 0, p90: 0 };
  return {
    repository: "acme/widgets",
    login: "octocat",
    buckets: [],
    authorFlows: flows,
    activity: givenTotal === null ? null : { login: "octocat", requested: [], given: [], requestedTotal: 0, givenTotal },
    awaiting: [],
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
});

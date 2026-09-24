import { describe, expect, it } from "vitest";
import type { ContextIssue, ThreadContext } from "./contract.js";
import { harvestItem } from "./harvest-item.js";

function issue(number: number, assignedToMe: boolean): ContextIssue {
  return {
    repo: "acme/widgets",
    number,
    url: `https://github.com/acme/widgets/issues/${number}`,
    title: `Issue ${number}`,
    state: "open",
    source: "prompt",
    viaPullRequest: null,
    assignedToMe,
  };
}

function context(overrides: Partial<ThreadContext>): ThreadContext {
  return {
    archived: false,
    hide: true,
    pullRequest: null,
    issues: [],
    changes: null,
    harvest: { available: true, running: null },
    ...overrides,
  };
}

const pullRequest = {
  repo: "acme/widgets",
  number: 128,
  title: "Promote widgets into core",
  url: "https://github.com/acme/widgets/pull/128",
  state: "open" as const,
  attention: "none" as const,
  checks: null,
  canMerge: true,
  myReview: null,
};

describe("harvestItem", () => {
  it("times the issue assigned to you, over the pull request", () => {
    expect(harvestItem(context({ pullRequest, issues: [issue(12, false), issue(34, true)] }))?.number).toBe(34);
  });

  it("times the pull request when no linked issue is yours", () => {
    expect(harvestItem(context({ pullRequest, issues: [issue(12, false)] }))?.number).toBe(128);
  });

  it("times the first issue when there is no pull request", () => {
    expect(harvestItem(context({ issues: [issue(12, false), issue(34, false)] }))?.url).toBe(
      "https://github.com/acme/widgets/issues/12",
    );
  });

  it("has nothing to time on a thread with neither", () => {
    expect(harvestItem(context({}))).toBeNull();
  });
});

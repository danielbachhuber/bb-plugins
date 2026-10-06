import { describe, expect, it } from "vitest";

import { applyDismissal, checksFingerprint } from "./dismiss.js";
import type { ClassifiedRow } from "./types.js";

function row(overrides: Partial<ClassifiedRow> = {}): ClassifiedRow {
  return {
    repo: "acme/widgets",
    number: 7,
    title: "Update the widget entry",
    url: "https://github.com/acme/widgets/pull/7",
    isDraft: false,
    flags: ["ci-failing", "no-reviewer"],
    group: "needs-action",
    checks: { pass: 0, fail: 1, skip: 0, pending: 0, cancelled: 0, total: 1 },
    approvedBy: [],
    commentedBy: [],
    waitingOn: [],
    lastCommentBy: null,
    unresolvedThreads: 0,
    outdatedThreads: 0,
    notedBy: [],
    awaitingReReview: false,
    headSha: "abc123",
    failingChecks: ["validate"],
    ...overrides,
  };
}

describe("checksFingerprint", () => {
  it("names the head commit and the failing checks, in a stable order", () => {
    expect(checksFingerprint(row({ failingChecks: ["lint", "build"] }))).toBe("abc123:build\nlint");
  });

  it("is null when no check is failing", () => {
    expect(checksFingerprint(row({ flags: ["no-reviewer"], failingChecks: [] }))).toBeNull();
  });

  it("is null for a row stored before the sweep read the head commit", () => {
    expect(checksFingerprint(row({ headSha: undefined }))).toBeNull();
  });
});

describe("applyDismissal", () => {
  it("drops the failing-checks flag while the dismissal matches", () => {
    const dismissed = applyDismissal(row(), "abc123:validate");
    expect(dismissed.flags).toEqual(["no-reviewer"]);
    expect(dismissed.dismissedChecks).toEqual(["validate"]);
  });

  it("moves a row with nothing else to do out of needs action", () => {
    const dismissed = applyDismissal(row({ flags: ["ci-failing"] }), "abc123:validate");
    expect(dismissed.flags).toEqual([]);
    expect(dismissed.group).toBe("clean");
  });

  it("brings the flag back after a new push", () => {
    const pushed = row({ headSha: "def456" });
    expect(applyDismissal(pushed, "abc123:validate")).toBe(pushed);
  });

  it("brings the flag back when a different check fails", () => {
    const another = row({ failingChecks: ["validate", "build"] });
    expect(applyDismissal(another, "abc123:validate")).toBe(another);
  });

  it("leaves a row with no dismissal alone", () => {
    const plain = row();
    expect(applyDismissal(plain, undefined)).toBe(plain);
  });
});

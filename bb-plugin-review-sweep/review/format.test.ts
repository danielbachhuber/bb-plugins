import { describe, expect, it } from "vitest";
import { factsFor, relativeTime, shortSizeLabel } from "./format.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function row(overrides: Partial<Parameters<typeof factsFor>[0]> = {}) {
  return {
    repo: "acme/widgets",
    author: "octocat",
    requestedAt: NOW - 5 * HOUR,
    size: { additions: 18, deletions: 4, changedFiles: 2 },
    snoozedUntil: null,
    threadId: null,
    requestedReviewers: [] as string[],
    ...overrides,
  };
}

describe("relativeTime", () => {
  it("rounds every unit down", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
    expect(relativeTime(NOW - 3 * HOUR - 1, NOW)).toBe("3h ago");
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe("2d ago");
    expect(relativeTime(NOW - 15 * DAY, NOW)).toBe("2w ago");
  });
});

describe("shortSizeLabel", () => {
  it("gives lines added and removed, with a real minus sign", () => {
    expect(shortSizeLabel({ additions: 18, deletions: 4, changedFiles: 2 })).toBe("+18 −4");
  });
});

describe("factsFor", () => {
  it("leads with the age of the request, since a Later row shows only the first fact", () => {
    expect(factsFor(row(), NOW, false)).toEqual(["5h ago", "octocat", "+18 −4"]);
  });

  it("names who was asked after the author, you first, as the old Reviewers column did", () => {
    expect(factsFor(row({ requestedReviewers: ["you", "platform"] }), NOW, false)).toEqual([
      "5h ago",
      "octocat",
      "you, platform",
      "+18 −4",
    ]);
  });

  it("leaves the reviewers out when none came back, rather than claiming nobody was asked", () => {
    expect(factsFor(row({ requestedReviewers: [] }), NOW, false)).toEqual(["5h ago", "octocat", "+18 −4"]);
  });

  it("names the repository only when asked to", () => {
    expect(factsFor(row(), NOW, true)).toEqual(["5h ago", "acme/widgets", "octocat", "+18 −4"]);
  });

  it("says when an ignored review comes back", () => {
    expect(factsFor(row({ snoozedUntil: NOW + 41 * HOUR }), NOW, false)).toEqual([
      "5h ago",
      "octocat",
      "+18 −4",
      "returns in 41 hours",
    ]);
  });

  it("leaves that out once a thread is running, since the row is no longer ignored", () => {
    expect(factsFor(row({ snoozedUntil: NOW + 41 * HOUR, threadId: "thr_1" }), NOW, false)).toEqual([
      "5h ago",
      "octocat",
      "+18 −4",
    ]);
  });
});

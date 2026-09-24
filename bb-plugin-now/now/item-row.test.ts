import { describe, expect, test } from "vitest";

import { archiveReason } from "./item-row.js";
import type { Item } from "./types.js";

function pullRow(github: Partial<NonNullable<Item["github"]>>): Item {
  return {
    id: "github:acme/widgets#128", source: "gmail", title: "Promote widgets into core", description: "", priority: null,
    due: null, deadline: null, activityAt: null, context: null, tags: [], url: "https://github.com/acme/widgets/pull/128",
    gmail: { threadIds: ["t1"], unread: false },
    github: {
      repo: "acme/widgets", number: 128, kind: "pull", state: "open", review: null, closedAs: null,
      reason: "review_requested", comment: null, ...github,
    },
  };
}

describe("archiveReason", () => {
  test("suggests Archive once your review is in, a team's request you answered included", () => {
    expect(archiveReason(pullRow({ reviewRequested: "you", myReview: "approved" }))).toBe("you reviewed");
    expect(archiveReason(pullRow({ reviewRequested: "you", myReview: "commented" }))).toBe("you reviewed");
  });

  test("does not while a review is still asked of you", () => {
    expect(archiveReason(pullRow({ reviewRequested: "team", myReview: "requested" }))).toBeNull();
    expect(archiveReason(pullRow({ reviewRequested: "you", myReview: "re-requested" }))).toBeNull();
  });

  test("suggests it for a review that was only ever someone else's", () => {
    expect(archiveReason(pullRow({ reviewRequested: "others", myReview: null }))).toBe("not your review");
  });
});

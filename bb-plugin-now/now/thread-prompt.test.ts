import { describe, expect, test } from "vitest";

import { itemOrigin, threadPrompt } from "./thread-prompt.js";
import type { Item } from "./types.js";

const base: Item = {
  id: "todoist:a1",
  source: "todoist",
  title: "Order new widget samples",
  description: "",
  priority: null,
  due: { date: "2026-09-29", recurring: false },
  deadline: null,
  activityAt: null,
  context: "Widgets",
  tags: [],
  url: "https://app.todoist.com/app/task/a1",
  gmail: null,
  github: null,
};

describe("threadPrompt", () => {
  test("states the row's facts and leaves room for the ask", () => {
    expect(threadPrompt(base)).toBe(
      "Todoist task in Widgets: Order new widget samples\nhttps://app.todoist.com/app/task/a1\nDue: 2026-09-29\n\n",
    );
  });

  test("names a GitHub row's pull request and quotes its latest comment", () => {
    const item: Item = {
      ...base,
      id: "github:acme/widgets#128",
      source: "gmail",
      title: "Promote widgets into core",
      description: "3 comments from octocat, hubber",
      due: null,
      context: "acme/widgets#128",
      url: "https://github.com/acme/widgets/pull/128",
      gmail: { threadIds: ["t1"] },
      github: {
        repo: "acme/widgets",
        number: 128,
        kind: "pull",
        state: "open",
        review: null,
        closedAs: null,
        reason: "review_requested",
        comment: { author: "hubber", text: "Could we ship core first?" },
      },
    };
    expect(threadPrompt(item)).toBe(
      "GitHub pull request acme/widgets#128: Promote widgets into core\n" +
        "https://github.com/acme/widgets/pull/128\n\n" +
        "3 comments from octocat, hubber\n\n" +
        "Latest comment from hubber: Could we ship core first?\n\n",
    );
  });

  test("names an email by its sender", () => {
    expect(itemOrigin({ ...base, source: "gmail", context: "Octocat" })).toBe("Email from Octocat");
  });
});

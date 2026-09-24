import { describe, expect, test } from "vitest";

import { classifyEvent, commentText, parseRef, parseTitle, summarize, type GitHubEvent } from "./notifications.js";

describe("parseRef", () => {
  test("reads the pull request or issue from a notification's message ids", () => {
    expect(parseRef("<acme/widgets/pull/128@github.com>")).toEqual({ repo: "acme/widgets", number: 128, kind: "pull" });
    expect(parseRef("<acme/widgets/pull/128/review/9@github.com>")).toEqual({ repo: "acme/widgets", number: 128, kind: "pull" });
    expect(parseRef("<acme/gadgets/issues/42/c1234@github.com>")).toEqual({ repo: "acme/gadgets", number: 42, kind: "issue" });
  });

  test("is null for anything else", () => {
    expect(parseRef("<CAF123@mail.example.com>")).toBeNull();
    expect(parseRef("<acme/widgets/commit/abc123@github.com>")).toBeNull();
    expect(parseRef(null)).toBeNull();
  });
});

describe("parseTitle", () => {
  test("drops the reply prefix, the repository, and the number", () => {
    expect(parseTitle("Re: [acme/widgets] Promote widgets into core (PR #128)")).toBe("Promote widgets into core");
    expect(parseTitle("[acme/gadgets] Gadgets break on Sundays (Issue #42)")).toBe("Gadgets break on Sundays");
  });
});

describe("classifyEvent", () => {
  const cases: Array<[string, GitHubEvent["type"]]> = [
    ["octocat left a comment (acme/widgets#128) Looks good to me", "comment"],
    ["@octocat commented on this pull request. In src/widget.ts:", "comment"],
    ["@hubber approved this pull request. Nice work.", "approved"],
    ["@hubber requested changes on this pull request.", "changes_requested"],
    ["Merged #128 into main. — Reply to this email directly", "merged"],
    ["Closed #42 as completed via #128.", "closed"],
    ["@octocat pushed 2 commits. abc123 Fix the widget", "pushed"],
    ["Something GitHub has not said before", "other"],
  ];
  test.each(cases)("%s", (snippet, type) => {
    expect(classifyEvent(snippet, "octocat")).toEqual({ type, actor: "octocat" });
  });

  test("says whose review a request asked for", () => {
    expect(classifyEvent("@octocat requested your review on: acme/widgets#128 Promote widgets", "octocat")).toEqual({
      type: "review_requested",
      actor: "octocat",
      requestedOf: "you",
    });
    expect(classifyEvent("@octocat requested review from @acme/reviewers on: acme/widgets#128", "octocat")).toEqual({
      type: "review_requested",
      actor: "octocat",
      requestedOf: "acme/reviewers",
    });
    expect(classifyEvent("@octocat requested review from @hubber on: acme/widgets#128", "octocat")?.requestedOf).toBe("hubber");
  });
});

describe("summarize", () => {
  test("counts comments and names who reviewed and whether it merged", () => {
    expect(
      summarize([
        { type: "comment", actor: "octocat" },
        { type: "comment", actor: "hubber" },
        { type: "comment", actor: "octocat" },
        { type: "review_requested", actor: "octocat" },
        { type: "approved", actor: "hubber" },
        { type: "pushed", actor: "octocat" },
        { type: "merged", actor: "octocat" },
      ]),
    ).toBe("3 comments from octocat, hubber · review requested by octocat · approved by hubber · merged");
  });

  test("names the team or person a review was asked of when it was not you", () => {
    expect(
      summarize([
        { type: "review_requested", actor: "octocat", requestedOf: "acme/reviewers" },
        { type: "approved", actor: "hubber" },
      ]),
    ).toBe("review requested of acme/reviewers by octocat · approved by hubber");
  });

  test("shortens a long list of people", () => {
    const events = ["a", "b", "c", "d", "e"].map((actor) => ({ type: "comment" as const, actor }));
    expect(summarize(events)).toBe("5 comments from a, b, c and 2 more");
  });

  test("says nothing for events it does not know", () => {
    expect(summarize([{ type: "other", actor: "octocat" }])).toBe("");
  });
});

describe("commentText", () => {
  test("drops a footer the snippet cut short", () => {
    expect(commentText("octocat left a comment (acme/widgets#128) Could you take another look? Thanks — Reply to this email")).toBe(
      "Could you take another look? Thanks",
    );
  });

  test("keeps what was written, without GitHub's opening and footer", () => {
    expect(
      commentText("octocat left a comment (acme/widgets#128) I'd keep these out of the widget API. — Reply to this email directly, view it on GitHub."),
    ).toBe("I'd keep these out of the widget API.");
    expect(commentText("@hubber approved this pull request. Looks good, ship it. — Reply to this email directly")).toBe(
      "Looks good, ship it.",
    );
    expect(commentText("github-actions[bot] left a comment (acme/widgets#128) Visual diff: no changes")).toBe(
      "Visual diff: no changes",
    );
  });

  test("stops where a review comment's diff begins", () => {
    expect(
      commentText("@hubber commented on this pull request. Looks great other than one nit. In src/widget.ts: > +export function widget() {"),
    ).toBe("Looks great other than one nit.");
  });

  test("is empty when nothing was written in words", () => {
    expect(commentText("Merged #128 into main. — Reply to this email directly")).toBe("");
    expect(commentText("@hubber approved this pull request. — Reply to this email directly")).toBe("");
    expect(commentText("@octocat commented on this pull request. In src/widget.ts: > @@ -1,6 +1,7 @@")).toBe("");
  });
});

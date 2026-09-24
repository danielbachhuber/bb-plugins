import { describe, expect, test } from "vitest";

import { githubRefs, inboxItems } from "./inbox.js";

function message(internalDate: number, snippet: string, headers: Record<string, string>) {
  return {
    internalDate: String(internalDate),
    snippet,
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
  };
}

function notification(internalDate: number, snippet: string, sender: string, extra: Record<string, string> = {}) {
  return message(internalDate, snippet, {
    Subject: "Re: [acme/widgets] Promote widgets into core (PR #128)",
    "In-Reply-To": "<acme/widgets/pull/128@github.com>",
    "X-GitHub-Reason": "mention",
    "X-GitHub-Sender": sender,
    ...extra,
  });
}

const T = 1790200000000;

describe("inboxItems", () => {
  test("gathers every thread about one pull request into one row", () => {
    const items = inboxItems(
      [
        { id: "t2", messages: [notification(T + 2000, "hubber left a comment (acme/widgets#128) Agreed", "hubber", { "X-GitHub-Reason": "review_requested" })] },
        { id: "plain", messages: [message(T + 1000, "Lunch?", { Subject: "Lunch", From: "Octocat <octocat@example.com>" })] },
        { id: "t1", messages: [notification(T, "octocat left a comment (acme/widgets#128) First", "octocat")] },
      ],
      null,
    );

    expect(items.map((item) => item.id)).toEqual(["github:acme/widgets#128", "gmail:plain"]);
    expect(items[0]).toMatchObject({
      title: "Promote widgets into core",
      description: "2 comments from octocat, hubber",
      context: "acme/widgets#128",
      activityAt: new Date(T + 2000).toISOString(),
      gmail: { threadIds: ["t2", "t1"], unread: false, messages: 2, unreadMessages: 0 },
      github: {
        repo: "acme/widgets",
        number: 128,
        kind: "pull",
        state: null,
        review: null,
        reason: "review_requested",
        comment: { author: "hubber", text: "Agreed" },
      },
    });
  });

  test("counts unread messages and tells a review asked of you from one asked of a team", () => {
    const unread = (item: ReturnType<typeof notification>) => ({ ...item, labelIds: ["UNREAD", "INBOX"] });
    const team = inboxItems(
      [
        {
          id: "t1",
          messages: [
            notification(T, "@octocat requested review from @acme/reviewers on: acme/widgets#128", "octocat", { "X-GitHub-Reason": "review_requested" }),
            notification(T + 1000, "@hubber approved this pull request.", "hubber", { "X-GitHub-Reason": "review_requested" }),
            unread(notification(T + 2000, "hubber left a comment (acme/widgets#128) Merging soon", "hubber", { "X-GitHub-Reason": "review_requested" })),
          ],
        },
      ],
      null,
    )[0];
    expect(team?.gmail).toMatchObject({ unread: true, messages: 3, unreadMessages: 1 });
    expect(team?.github?.reviewRequested).toBe("others");

    const yours = inboxItems(
      [{ id: "t1", messages: [notification(T, "@octocat requested your review on: acme/widgets#128", "octocat", { "X-GitHub-Reason": "review_requested" })] }],
      null,
    )[0];
    expect(yours?.github?.reviewRequested).toBe("you");
    expect(inboxItems([{ id: "t1", messages: [notification(T, "octocat left a comment (acme/widgets#128) Hi", "octocat")] }], null)[0]?.github?.reviewRequested).toBeNull();
  });

  test("prefers gh's state to the email header", () => {
    const thread = { id: "t1", messages: [notification(T, "Merged #128 into main.", "octocat", { "X-GitHub-PullRequestStatus": "open" })] };

    expect(inboxItems([thread], null)[0]?.github?.state).toBe("open");
    expect(
      inboxItems([thread], null, new Map([["acme/widgets#128", { state: "merged" as const, review: null }]]))[0]?.github?.state,
    ).toBe("merged");
  });

  test("treats a person's email that mentions a GitHub link as an email", () => {
    const thread = {
      id: "t1",
      messages: [message(T, "See https://github.com/acme/widgets/pull/128", { Subject: "Have a look", "In-Reply-To": "<acme/widgets/pull/128@github.com>" })],
    };
    expect(inboxItems([thread], null)[0]?.github).toBeNull();
    expect(githubRefs([thread])).toEqual([]);
  });
});

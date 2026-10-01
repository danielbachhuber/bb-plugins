import { describe, expect, test } from "vitest";

import { latestMessageText, tidyEmailText } from "./email-text.js";

describe("tidyEmailText", () => {
  test("trims each line and keeps one blank line between paragraphs", () => {
    expect(tidyEmailText("  Hi Octocat,\r\n\r\n\r\n\r\nThe widgets   shipped.  \n\nHubber\n\n")).toBe("Hi Octocat,\n\nThe widgets shipped.\n\nHubber");
  });

  test("drops the earlier messages a reply quotes", () => {
    expect(tidyEmailText("Sounds good.\n\nOn Mon, Sep 28, 2026 at 9:00 AM Hubber <hubber@example.com> wrote:\n> Lunch on Friday?")).toBe("Sounds good.");
    expect(tidyEmailText("See below.\n\n---------- Forwarded message ---------\nFrom: Octocat")).toBe("See below.");
    expect(tidyEmailText("Agreed.\n\n> Ship the widgets?\n>\n> Hubber")).toBe("Agreed.");
  });

  test("keeps a quote with writing after it", () => {
    expect(tidyEmailText("> Ship the widgets?\nYes, Friday.")).toBe("> Ship the widgets?\nYes, Friday.");
  });
});

describe("latestMessageText", () => {
  test("reads the latest message's plain text", () => {
    const message = (id: string, text: string) => ({ id, from: "Hubber", address: null, date: null, snippet: "", html: null, text });
    const thread = { threadId: "t1", subject: "Widgets", url: "", messages: [message("m1", "First"), message("m2", "Second\n\nThanks")] };
    expect(latestMessageText(thread)).toBe("Second\n\nThanks");
    expect(latestMessageText({ ...thread, messages: [] })).toBe("");
  });
});

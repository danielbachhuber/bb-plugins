import { describe, expect, test } from "vitest";

import { decodeEntities, normalizeThread, senderName, threadUrl } from "./normalize.js";

function message(overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return {
    id: "m1",
    threadId: "t1",
    internalDate: "1790237080000",
    labelIds: ["INBOX"],
    snippet: "",
    payload: { mimeType: "multipart/alternative", headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
    ...overrides,
  };
}

describe("decodeEntities", () => {
  test("decodes the named and numeric entities Gmail snippets carry", () => {
    expect(decodeEntities("Octocat&#39;s &quot;widgets&quot; &amp; gadgets &lt;3 &#x2014; &nbsp;ok")).toBe(
      "Octocat's \"widgets\" & gadgets <3 —  ok",
    );
  });

  test("leaves an unknown entity alone", () => {
    expect(decodeEntities("&bogus; stays")).toBe("&bogus; stays");
  });
});

describe("senderName", () => {
  test("uses the display name when there is one", () => {
    expect(senderName('"Octocat" <octocat@example.com>')).toBe("Octocat");
    expect(senderName("Hubber <hubber@example.com>")).toBe("Hubber");
  });

  test("falls back to the address", () => {
    expect(senderName("<octocat@example.com>")).toBe("octocat@example.com");
    expect(senderName("octocat@example.com")).toBe("octocat@example.com");
  });
});

describe("threadUrl", () => {
  test("names the account when it is known", () => {
    expect(threadUrl("t1", "hubber@example.com")).toBe("https://mail.google.com/mail/?authuser=hubber%40example.com#all/t1");
    expect(threadUrl("t1", null)).toBe("https://mail.google.com/mail/#all/t1");
  });
});

describe("normalizeThread", () => {
  test("takes the subject from the first message and the rest from the latest", () => {
    const item = normalizeThread(
      {
        id: "t1",
        messages: [
          message({ internalDate: "1790200000000", snippet: "First" }, { Subject: "Widget launch", From: "Hubber <hubber@example.com>" }),
          message(
            { id: "m2", snippet: "Sounds good &amp; thanks" },
            { Subject: "Re: Widget launch", From: "Octocat <octocat@example.com>" },
          ),
        ],
      },
      null,
    );

    expect(item).toEqual({
      id: "gmail:t1",
      source: "gmail",
      title: "Widget launch",
      description: "Sounds good & thanks",
      priority: null,
      due: null,
      deadline: null,
      activityAt: new Date(1790237080000).toISOString(),
      context: "Octocat",
      tags: [],
      url: "https://mail.google.com/mail/#all/t1",
    });
  });

  test("names a thread with no subject", () => {
    expect(normalizeThread({ id: "t1", messages: [message()] }, null)?.title).toBe("(no subject)");
  });

  test("skips a thread without messages", () => {
    expect(normalizeThread({ id: "t1", messages: [] }, null)).toBeNull();
    expect(normalizeThread({ id: "t1" }, null)).toBeNull();
  });
});

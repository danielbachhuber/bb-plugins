import { describe, expect, test } from "vitest";

import { emailThread, messageBody } from "./body.js";

function data(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function headers(values: Record<string, string>) {
  return Object.entries(values).map(([name, value]) => ({ name, value }));
}

function message(id: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { id, threadId: "t1", internalDate: "1790237080000", labelIds: ["INBOX"], payload, ...extra };
}

describe("messageBody", () => {
  test("prefers the HTML part of an alternative", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: data("Plain widgets") } },
        { mimeType: "text/html", body: { data: data("<p>Widgets &amp; gadgets</p>") } },
      ],
    };
    expect(messageBody(payload)).toEqual({ html: "<p>Widgets &amp; gadgets</p>", text: "Plain widgets" });
  });

  test("finds the text inside a mixed message and skips its attachments", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [{ mimeType: "text/plain", body: { data: data("See the attached widget.") } }],
        },
        { mimeType: "text/plain", filename: "widget.txt", body: { attachmentId: "a1", size: 10 } },
      ],
    };
    expect(messageBody(payload)).toEqual({ html: null, text: "See the attached widget." });
  });

  test("reads a message that is a single part", () => {
    expect(messageBody({ mimeType: "text/plain", body: { data: data("Just text — with a dash") } })).toEqual({
      html: null,
      text: "Just text — with a dash",
    });
  });

  test("decodes a part in the charset it names", () => {
    const latin1 = Buffer.from("Café", "latin1").toString("base64url");
    const payload = {
      mimeType: "text/plain",
      headers: headers({ "Content-Type": 'text/plain; charset="ISO-8859-1"' }),
      body: { data: latin1 },
    };
    expect(messageBody(payload).text).toBe("Café");
  });

  test("keeps the first HTML part when a message carries several", () => {
    const payload = {
      mimeType: "multipart/related",
      parts: [
        { mimeType: "text/html", body: { data: data("<p>first</p>") } },
        { mimeType: "text/html", body: { data: data("<p>second</p>") } },
      ],
    };
    expect(messageBody(payload).html).toBe("<p>first</p>");
  });
});

describe("emailThread", () => {
  const raw = {
    id: "t1",
    messages: [
      message("m1", {
        mimeType: "text/plain",
        headers: headers({ From: '"Octocat" <octocat@acme.example>', Subject: "Saturday's gadget swap" }),
        body: { data: data("Anyone around Saturday?") },
      }, { snippet: "Anyone around Saturday?" }),
      message(
        "m2",
        {
          mimeType: "text/plain",
          headers: headers({ From: "Hubber <hubber@acme.example>", Subject: "Re: Saturday's gadget swap" }),
          body: { data: data("Yes, 10am.") },
        },
        { internalDate: "1790240680000" },
      ),
    ],
  };

  test("gives each message its sender, date, and body, under the first subject", () => {
    expect(emailThread(raw, null)).toEqual({
      threadId: "t1",
      subject: "Saturday's gadget swap",
      url: "https://mail.google.com/mail/#all/t1",
      messages: [
        {
          id: "m1",
          from: "Octocat",
          address: "octocat@acme.example",
          date: new Date(1790237080000).toISOString(),
          snippet: "Anyone around Saturday?",
          html: null,
          text: "Anyone around Saturday?",
        },
        {
          id: "m2",
          from: "Hubber",
          address: "hubber@acme.example",
          date: new Date(1790240680000).toISOString(),
          snippet: "",
          html: null,
          text: "Yes, 10am.",
        },
      ],
    });
  });

  test("names your own messages Me", () => {
    const thread = emailThread(
      {
        id: "t1",
        messages: [message("m1", { mimeType: "text/plain", headers: headers({ From: "Hubber <hubber@acme.example>" }) })],
      },
      "hubber@acme.example",
    );
    expect(thread?.messages[0]?.from).toBe("Me");
  });

  test("is null for a thread with no messages", () => {
    expect(emailThread({ id: "t1", messages: [] }, null)).toBeNull();
    expect(emailThread("nonsense", null)).toBeNull();
  });
});

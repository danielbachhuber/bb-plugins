import { describe, expect, it } from "vitest";
import { parseComments, seenThroughOwn } from "./comments.js";

describe("seenThroughOwn", () => {
  it("counts a comment of your own as seen", () => {
    expect(seenThroughOwn(["hubber", "octocat"], 1, "octocat")).toBe(2);
  });

  it("counts everything before your latest comment as seen, and only what others wrote after it as new", () => {
    expect(seenThroughOwn(["hubber", "hubber", "octocat", "hubber"], 1, "octocat")).toBe(3);
  });

  it("leaves the count alone when you have not commented since", () => {
    expect(seenThroughOwn(["octocat", "hubber", "hubber"], 1, "octocat")).toBe(1);
    expect(seenThroughOwn(["hubber"], 0, "octocat")).toBe(0);
  });

  it("never moves the count down", () => {
    expect(seenThroughOwn(["octocat"], 3, "octocat")).toBe(3);
  });

  it("matches your login however it is cased", () => {
    expect(seenThroughOwn(["OctoCat"], 0, "octocat")).toBe(1);
  });
});

describe("parseComments", () => {
  const payload = (nodes: unknown[], totalCount = nodes.length) =>
    JSON.stringify({ data: { repository: { issue: { comments: { totalCount, nodes } } } } });

  it("reads each comment's author, text, link, and time, oldest first as GitHub sends them", () => {
    const raw = payload([
      {
        author: { login: "hubber", avatarUrl: "https://example.test/hubber.png" },
        bodyText: "  Can this wait a sprint?\n",
        url: "https://github.com/acme/widgets/issues/42#issuecomment-1",
        createdAt: "2026-01-02T03:04:05Z",
      },
      { author: { login: "octocat", avatarUrl: "" }, bodyText: "Yes.", url: "u2", createdAt: "2026-01-03T00:00:00Z" },
    ]);
    expect(parseComments(raw)).toEqual({
      comments: [
        {
          author: "hubber",
          avatarUrl: "https://example.test/hubber.png",
          body: "Can this wait a sprint?",
          url: "https://github.com/acme/widgets/issues/42#issuecomment-1",
          at: Date.parse("2026-01-02T03:04:05Z"),
        },
        { author: "octocat", avatarUrl: "", body: "Yes.", url: "u2", at: Date.parse("2026-01-03T00:00:00Z") },
      ],
      total: 2,
    });
  });

  it("keeps a deleted account's comment in place, so the new ones still line up with the end", () => {
    const { comments } = parseComments(payload([{ author: null, bodyText: "Old note", url: "u", createdAt: "2026-01-01T00:00:00Z" }]));
    expect(comments.map((comment) => comment.author)).toEqual(["ghost"]);
  });

  it("reports the issue's full count when it has more comments than were read", () => {
    expect(parseComments(payload([], 80)).total).toBe(80);
  });

  it("reads nothing from an issue GitHub did not return", () => {
    expect(parseComments(JSON.stringify({ data: { repository: { issue: null } } }))).toEqual({ comments: [], total: 0 });
  });
});

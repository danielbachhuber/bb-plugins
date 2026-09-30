import { describe, expect, it } from "vitest";
import { seenThroughOwn } from "./comments.js";

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

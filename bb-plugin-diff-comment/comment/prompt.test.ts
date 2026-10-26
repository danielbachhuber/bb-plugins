import { describe, expect, it } from "vitest";
import { askPrompt } from "./prompt";

describe("askPrompt", () => {
  it("names the skill rather than restating the procedure", () => {
    expect(askPrompt(3)).toContain("diff-comments skill");
    expect(askPrompt(3)).not.toMatch(/bb diff-comment /);
  });

  it("names the one comment to answer", () => {
    expect(askPrompt(3)).toContain("#3");
    expect(askPrompt(3)).toContain("that comment only");
  });
});

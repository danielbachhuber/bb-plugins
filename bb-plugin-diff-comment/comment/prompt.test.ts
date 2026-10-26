import { describe, expect, it } from "vitest";
import { askPrompt, forkPrompt } from "./prompt";

describe.each([
  ["forkPrompt", forkPrompt],
  ["askPrompt", askPrompt],
])("%s", (_name, prompt) => {
  it("names the skill rather than restating the procedure", () => {
    expect(prompt(3)).toContain("diff-comments skill");
    expect(prompt(3)).not.toMatch(/bb diff-comment (show|reply|next)/);
  });

  it("names the one comment to answer", () => {
    expect(prompt(3)).toContain("#3");
    expect(prompt(3)).toContain("that comment only");
  });
});

describe("forkPrompt", () => {
  it("tells the fork not to pick up the thread's own work", () => {
    expect(forkPrompt(3)).toContain("Do not carry on with the work above");
  });
});

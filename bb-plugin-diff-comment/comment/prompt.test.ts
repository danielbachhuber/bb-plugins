import { describe, expect, it } from "vitest";
import { agentPrompt } from "./prompt";

describe("agentPrompt", () => {
  it("names the skill rather than restating the procedure", () => {
    expect(agentPrompt(3)).toContain("diff-comments skill");
    expect(agentPrompt(3)).not.toMatch(/bb diff-comment /);
  });

  it("says how many there are, so the agent knows when it is finished", () => {
    expect(agentPrompt(3)).toContain("3 open comments");
  });

  it("reads correctly for a single comment", () => {
    expect(agentPrompt(1)).toContain("1 open comment on this diff");
    // "diff-comments skill" is plural by name, so check the noun phrase.
    expect(agentPrompt(1)).not.toContain("open comments");
  });

  it("asks for them one at a time", () => {
    expect(agentPrompt(2)).toContain("one at a time");
  });
});

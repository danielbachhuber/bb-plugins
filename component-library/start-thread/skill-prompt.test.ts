import { describe, expect, it } from "vitest";
import { skillPrompt, type SuggestedSkill } from "./keys";

const SKILLS: SuggestedSkill[] = [
  { name: "resolve-merge-conflicts", reason: "Conflicts with main", instruction: "Resolve the conflict." },
  { name: "address-code-review", reason: "2 new comments", instruction: "Answer the comments." },
];

describe("skillPrompt", () => {
  it("is empty when nothing is picked", () => {
    expect(skillPrompt(SKILLS, new Set())).toBe("");
  });

  it("keeps the plugin's order, whatever order the chips were clicked in", () => {
    expect(skillPrompt(SKILLS, new Set(["address-code-review", "resolve-merge-conflicts"]))).toBe(
      "Resolve the conflict.\n\nAnswer the comments.",
    );
  });
});

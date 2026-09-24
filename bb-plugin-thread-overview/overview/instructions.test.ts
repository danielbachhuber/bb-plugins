import { describe, expect, it } from "vitest";
import { INSTRUCTIONS_STATIC_BLOCK, threadInstructions } from "./instructions.js";
import type { Step } from "./types.js";

function step(i: number, status: Step["status"], text = `Step number ${i}`): Step {
  return {
    id: `id${i}`,
    threadId: "t1",
    text,
    status,
    source: "agent",
    position: i,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("threadInstructions", () => {
  it("fits the SDK's limit with room for a full overview", () => {
    const steps = Array.from({ length: 200 }, (_, i) => step(i, i < 150 ? "done" : "todo", "x".repeat(40)));
    const text = threadInstructions({ summary: "s".repeat(1000), steps });
    expect(text.length).toBeLessThan(4096);
    expect(INSTRUCTIONS_STATIC_BLOCK.length).toBeLessThan(2000);
  });

  it("keeps unfinished steps when the budget runs short, and says what is missing", () => {
    const steps = Array.from({ length: 60 }, (_, i) => step(i, i < 55 ? "done" : "todo", `${"y".repeat(40)} ${i}`));
    const text = threadInstructions({ summary: "Summary.", steps });
    for (let i = 55; i < 60; i += 1) expect(text).toContain(`[ ] id${i}`);
    expect(text).toMatch(/\d+ steps not shown here/);
  });

  it("asks for an overview when there is none", () => {
    expect(threadInstructions({ summary: "", steps: [] })).toContain("None yet.");
  });

  it("embeds the summary and marks", () => {
    const text = threadInstructions({ summary: "Add a CSV export.", steps: [step(1, "current")] });
    expect(text).toContain("Summary: Add a CSV export.");
    expect(text).toContain("[>] id1  Step number 1");
  });
});

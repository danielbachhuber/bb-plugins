import { describe, expect, it } from "vitest";
import { renderSteps, type OverviewStep } from "./forward.js";

function step(id: string, text: string, status: OverviewStep["status"], position: number): OverviewStep {
  return { id, threadId: "t1", text, status, source: "agent", position, createdAt: 0, updatedAt: 0 };
}

describe("renderSteps", () => {
  it("renders Thread Overview's steps in the list format older threads read", () => {
    const text = renderSteps([
      step("a", "Finished", "done", 1),
      step("b", "In progress", "current", 2),
      step("c", "Not started", "todo", 3),
    ]);
    expect(text).toBe("[ ] b  In progress\n[ ] c  Not started\n[x] a  Finished\n\n2 open of 3.");
  });

  it("says the list is empty", () => {
    expect(renderSteps([])).toBe("The todo list is empty.");
  });
});

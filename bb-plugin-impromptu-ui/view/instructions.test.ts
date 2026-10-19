import { describe, expect, it } from "vitest";
import { THREAD_INSTRUCTIONS } from "./instructions.js";

describe("THREAD_INSTRUCTIONS", () => {
  it("stays well inside the SDK's 4,096-character limit", () => {
    expect(THREAD_INSTRUCTIONS.length).toBeLessThan(1500);
  });

  it("points to the skill and the command", () => {
    expect(THREAD_INSTRUCTIONS).toContain("`impromptu-ui` skill");
    expect(THREAD_INSTRUCTIONS).toContain("bb impromptu-ui publish");
    expect(THREAD_INSTRUCTIONS).toContain("bb impromptu-ui schema");
  });
});

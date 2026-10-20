import { describe, expect, it } from "vitest";
import { needsDot } from "./sidebar";

describe("needsDot", () => {
  it("marks a checkout that is out of date or failed to pull, not one only ahead", () => {
    expect(needsDot("behind")).toBe(true);
    expect(needsDot("diverged")).toBe(true);
    expect(needsDot("error")).toBe(true);
    expect(needsDot("ahead")).toBe(false);
    expect(needsDot("synced")).toBe(false);
  });
});

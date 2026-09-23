import { describe, expect, it } from "vitest";
import { isAdoptable } from "./adopt.js";

describe("isAdoptable", () => {
  it("takes a thread typed into the composer", () => {
    expect(isAdoptable({ id: "thr_1", originPluginId: null, archivedAt: null })).toBe(true);
  });

  it("leaves a thread another plugin started to that plugin", () => {
    expect(isAdoptable({ id: "thr_1", originPluginId: "pr-sweep", archivedAt: null })).toBe(false);
    expect(isAdoptable({ id: "thr_1", originPluginId: "issue-sweep", archivedAt: null })).toBe(
      false,
    );
  });

  it("leaves an archived thread alone, since its work is over", () => {
    expect(isAdoptable({ id: "thr_1", originPluginId: null, archivedAt: 1 })).toBe(false);
  });
});

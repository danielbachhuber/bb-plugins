import { describe, expect, it } from "vitest";
import { isAdoptable } from "./adopt.js";

describe("isAdoptable", () => {
  it("takes a thread typed into the composer", () => {
    expect(isAdoptable({ id: "thr_1", originPluginId: null, archivedAt: null })).toBe(true);
  });

  it("leaves a thread any plugin started to that plugin", () => {
    expect(isAdoptable({ id: "thr_1", originPluginId: "pr-sweep", archivedAt: null })).toBe(false);
    expect(isAdoptable({ id: "thr_1", originPluginId: "issue-sweep", archivedAt: null })).toBe(
      false,
    );
  });

  it("leaves an archived thread alone, since its work is over", () => {
    expect(isAdoptable({ id: "thr_1", originPluginId: null, archivedAt: 1 })).toBe(false);
  });

  it("takes back one of its own when the caller names itself", () => {
    // Archiving drops the link, and unarchiving fires no event to restore it,
    // so a thread the user brings back has to be picked up by the sweep or the
    // row goes on offering to start a second one.
    expect(isAdoptable({ id: "thr_1", originPluginId: "pr-sweep", archivedAt: null }, "pr-sweep")).toBe(
      true,
    );
  });

  it("still leaves another plugin's thread alone", () => {
    expect(
      isAdoptable({ id: "thr_1", originPluginId: "issue-sweep", archivedAt: null }, "pr-sweep"),
    ).toBe(false);
  });

  it("does not take back its own once archived", () => {
    expect(
      isAdoptable({ id: "thr_1", originPluginId: "pr-sweep", archivedAt: 1 }, "pr-sweep"),
    ).toBe(false);
  });
});

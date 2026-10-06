import { describe, expect, it } from "vitest";
import { changesPanelFiles, changesPanelMark } from "./changes-panel";

describe("the changes panel's Viewed marks", () => {
  it("reads each marked file by its path, with the counts it was marked at", () => {
    const files = changesPanelFiles({ "src/widget.ts": "+3 -1", "src/old.ts -> src/new.ts": "+0 -2", "logo.png": "none", "odd.ts": "garbled" });
    expect([...files.values()]).toEqual([
      { path: "src/widget.ts", additions: 3, deletions: 1, viewed: true },
      { path: "src/new.ts", additions: 0, deletions: 2, viewed: true },
      { path: "logo.png", additions: 0, deletions: 0, viewed: true },
    ]);
  });

  it("names a file the way the changes panel does, a rename by both paths", () => {
    expect(changesPanelMark({ path: "src/widget.ts", previousPath: null, binary: false, added: 3, removed: 1 })).toEqual({ path: "src/widget.ts", fingerprint: "+3 -1" });
    expect(changesPanelMark({ path: "src/new.ts", previousPath: "src/old.ts", binary: false, added: 0, removed: 2 })).toEqual({ path: "src/old.ts -> src/new.ts", fingerprint: "+0 -2" });
    expect(changesPanelMark({ path: "logo.png", previousPath: null, binary: true, added: 0, removed: 0 })).toEqual({ path: "logo.png", fingerprint: "none" });
  });
});

import { describe, expect, it } from "vitest";
import { coverageLabel, hunkNote, staleLabel } from "./labels";

const file = (indexes: number[], total: number) => ({
  path: "a.ts",
  previousPath: null,
  fileStatus: "modified" as const,
  binary: false,
  header: "",
  total,
  hunks: indexes.map((index) => ({ path: "a.ts", index, kind: "hunk" as const, header: "", text: "", status: "current" as const })),
});

describe("labels", () => {
  it("names the hunks of a split file, counting from 1", () => {
    expect(hunkNote(file([0, 2], 4))).toBe("hunks 1 and 3 of 4");
    expect(hunkNote(file([0, 1, 3], 4))).toBe("hunks 1, 2, and 4 of 4");
    expect(hunkNote(file([1], 2))).toBe("hunk 2 of 2");
    expect(hunkNote(file([0, 1], 2))).toBeNull();
  });

  it("says how far the branch has moved", () => {
    expect(staleLabel(2, 3)).toBe("2 commits and 3 files changed since");
    expect(staleLabel(0, 1)).toBe("1 file changed since");
    expect(staleLabel(null, 2)).toBe("the branch was rewritten, and 2 files changed since");
  });

  it("counts what is shown", () => {
    expect(coverageLabel({ files: 41, hunks: 118, shown: 118 })).toBe("41 files, 118 hunks, all shown");
    expect(coverageLabel({ files: 1, hunks: 1, shown: 1 })).toBe("1 file, 1 hunk, all shown");
    expect(coverageLabel({ files: 41, hunks: 118, shown: 117 })).toBe("41 files, 117 of 118 hunks shown");
  });
});

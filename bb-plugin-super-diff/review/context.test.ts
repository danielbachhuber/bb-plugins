import { describe, expect, it } from "vitest";
import { sidesForHunk } from "./context";

// The file now: a, B, c, d, e, F, g. Two hunks changed b→B and f→F.
const NOW = ["a", "B", "c", "d", "e", "F", "g", ""].join("\n");

describe("sidesForHunk", () => {
  it("builds an old side with only this hunk reverted, and points the hunk at it", () => {
    const sides = sidesForHunk(NOW, "@@ -5,3 +5,3 @@\n e\n-f\n+F\n g\n");
    expect(sides).toEqual({
      oldText: ["a", "B", "c", "d", "e", "f", "g", ""].join("\n"),
      hunk: "@@ -5,3 +5,3 @@\n e\n-f\n+F\n g\n",
    });
  });

  it("numbers the old side as the file is now, once an earlier hunk shifted it", () => {
    // An earlier hunk added two lines, so git numbered this hunk's old side from 3.
    const now = ["x", "y", "a", "B", "c", ""].join("\n");
    const sides = sidesForHunk(now, "@@ -1,3 +3,3 @@\n a\n-b\n+B\n c\n");
    expect(sides).toEqual({ oldText: ["x", "y", "a", "b", "c", ""].join("\n"), hunk: "@@ -3,3 +3,3 @@\n a\n-b\n+B\n c\n" });
  });

  it("handles a hunk that only adds lines, and one that only removes them", () => {
    expect(sidesForHunk(["a", "new", "b", ""].join("\n"), "@@ -1,0 +2 @@\n+new\n")).toEqual({
      oldText: ["a", "b", ""].join("\n"),
      hunk: "@@ -1,0 +2,1 @@\n+new\n",
    });
    expect(sidesForHunk(["a", "b", ""].join("\n"), "@@ -2 +1,0 @@\n-gone\n")).toEqual({
      oldText: ["a", "gone", "b", ""].join("\n"),
      hunk: "@@ -2,1 +1,0 @@\n-gone\n",
    });
  });

  it("gives up when the hunk is not what the file holds, or when a side has no final newline", () => {
    expect(sidesForHunk(NOW, "@@ -5,3 +5,3 @@\n e\n-f\n+Z\n g\n")).toBeNull();
    expect(sidesForHunk("a\nB", "@@ -2 +2 @@\n-b\n\\ No newline at end of file\n+B\n\\ No newline at end of file\n")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { anchorLines } from "./grouping";

const PATCH = [
  "@@ -10,4 +10,3 @@",
  " const kept = 1;",
  "-const gone = 2;",
  "-const renamed = 3;",
  "+const renamedAgain = 3;",
  " const tail = 4;",
].join("\n");

describe("anchorLines", () => {
  it("numbers added and unchanged lines on the new side", () => {
    expect(anchorLines(PATCH, "const tail")).toEqual({ side: "new", lines: [12] });
    expect(anchorLines(PATCH, "renamedAgain")).toEqual({ side: "new", lines: [11] });
  });

  it("finds a removed line, numbered on the old side, when no new-side line matches", () => {
    expect(anchorLines(PATCH, "const gone")).toEqual({ side: "old", lines: [11] });
  });

  it("prefers the new side when text is on both, so earlier notes keep their line", () => {
    expect(anchorLines(PATCH, "const renamed")).toEqual({ side: "new", lines: [11] });
    expect(anchorLines(PATCH, "const renamed = 3")).toEqual({ side: "old", lines: [12] });
  });

  it("finds nothing for text on no line", () => {
    expect(anchorLines(PATCH, "missing")).toEqual({ side: "old", lines: [] });
  });
});

import { describe, expect, it } from "vitest";
import { anchorFromFile, parseLocation } from "./add";

describe("parseLocation", () => {
  it("splits path and line at the last colon", () => {
    expect(parseLocation("src/widget.ts:42")).toEqual({ path: "src/widget.ts", line: 42 });
    expect(parseLocation("docs/a:b.md:3")).toEqual({ path: "docs/a:b.md", line: 3 });
  });

  it("refuses a location without a positive line", () => {
    expect(parseLocation("src/widget.ts")).toBeNull();
    expect(parseLocation("src/widget.ts:0")).toBeNull();
    expect(parseLocation("src/widget.ts:abc")).toBeNull();
  });
});

describe("anchorFromFile", () => {
  const FILE = "const a = 1;\nconst b = 2;\nconst c = 3;\n";

  it("takes the line and the lines either side", () => {
    expect(anchorFromFile(FILE, 2)).toEqual({
      text: "const b = 2;",
      before: "const a = 1;",
      after: "const c = 3;",
    });
  });

  it("has no neighbour past either end", () => {
    expect(anchorFromFile(FILE, 1)?.before).toBeNull();
    expect(anchorFromFile(FILE, 3)?.after).toBeNull();
  });

  it("refuses a line past the end of the file", () => {
    expect(anchorFromFile(FILE, 4)).toBeNull();
  });
});

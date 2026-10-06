import { describe, expect, it } from "vitest";
import type { BarFile } from "@/review/contract";
import { barGroups, MIN_GROUP_PX, readShare, sectionFor } from "./bar";

const file = (path: string, ...hunks: Array<[number, boolean, string?]>): BarFile => ({
  path,
  hunks: hunks.map(([lines, read, section = "concern-0"], index) => ({ index, lines, read, section })),
});

describe("barGroups", () => {
  it("gives each file its own group, named by its file name, while each has room", () => {
    const { byDirectory, groups } = barGroups([file("src/a.ts", [3, false]), file("README.md", [1, true])], 2 * MIN_GROUP_PX);
    expect(byDirectory).toBe(false);
    expect(groups.map((g) => [g.label, g.title, g.lines])).toEqual([
      ["a.ts", "src/a.ts", 3],
      ["README.md", "README.md", 1],
    ]);
  });

  it("groups by directory when the files would be too narrow, in diff order, with root files under ./", () => {
    const files = [file("README.md", [2, false]), file("src/a.ts", [2, false]), file("src/b.ts", [2, false]), file("test/a.ts", [2, false])];
    const { byDirectory, groups } = barGroups(files, 3 * MIN_GROUP_PX);
    expect(byDirectory).toBe(true);
    expect(groups.map((g) => [g.label, g.files.length, g.lines])).toEqual([
      ["./", 1, 2],
      ["src/", 2, 4],
      ["test/", 1, 2],
    ]);
  });

  it("uses shorter directories when the deepest ones are still too many", () => {
    const files = ["client/a/x.ts", "client/b/x.ts", "client/c/x.ts", "server/a/x.ts", "server/b/x.ts"].map((path) => file(path, [1, false]));
    expect(barGroups(files, 4 * MIN_GROUP_PX).groups.map((g) => g.label)).toEqual(["client/", "server/"]);
    expect(barGroups(files, 5 * MIN_GROUP_PX).byDirectory).toBe(false);
  });
});

describe("readShare and sectionFor", () => {
  it("weighs read hunks by their lines", () => {
    expect(readShare(file("a.ts", [3, true], [1, false]))).toBe(0.75);
  });

  it("opens the section of the first unread hunk, or the first hunk when all are read", () => {
    expect(sectionFor(file("a.ts", [1, true, "concern-0"], [1, false, "concern-2"]))).toBe("concern-2");
    expect(sectionFor(file("a.ts", [1, true, "concern-1"]))).toBe("concern-1");
  });
});

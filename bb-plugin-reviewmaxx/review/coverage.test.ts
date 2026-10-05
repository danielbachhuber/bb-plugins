import { describe, expect, it } from "vitest";
import { checkCoverage, formatCoverage } from "./coverage";
import type { Item } from "./types";

const items: Item[] = [
  { path: "a.ts", index: 0, kind: "hunk", hash: "1" },
  { path: "a.ts", index: 1, kind: "hunk", hash: "2" },
  { path: "b.png", index: 0, kind: "file", hash: "3" },
];

describe("checkCoverage", () => {
  it("passes when every item is shown once and every path is parsed", () => {
    const report = checkCoverage(["a.ts", "b.png"], items, ["a.ts#0", "b.png#0", "a.ts#1"]);
    expect(formatCoverage(report)).toEqual({ ok: true, text: "2 files, 3 hunks: 3 shown once, 0 missing, 0 twice." });
  });

  it("reports a path git lists that the parser lost, and each item problem", () => {
    const report = checkCoverage(["a.ts", "b.png", "c.ts"], items, ["a.ts#0", "a.ts#0", "z.ts#0"]);
    const { ok, text } = formatCoverage(report);
    expect(ok).toBe(false);
    expect(text).toBe(
      [
        "3 files, 3 hunks: 0 shown once, 2 missing, 1 twice.",
        "not in the parsed diff: c.ts",
        "missing: a.ts#1",
        "missing: b.png#0",
        "twice: a.ts#0",
        "not in the diff: z.ts#0",
      ].join("\n"),
    );
  });
});

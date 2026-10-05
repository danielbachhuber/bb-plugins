import { describe, expect, it } from "vitest";
import { formatViolation, parseGrouping, resolveGrouping } from "./check";
import type { Grouping } from "./grouping";
import type { Item } from "./types";

const items: Item[] = [
  { path: "src/widget.ts", index: 0, kind: "hunk", hash: "w0" },
  { path: "src/widget.ts", index: 1, kind: "hunk", hash: "w1" },
  { path: "src/gadget.ts", index: 0, kind: "hunk", hash: "g0" },
  { path: "package-lock.json", index: 0, kind: "hunk", hash: "l0" },
];
const mechanical = (path: string) => path === "package-lock.json";

function grouping(concerns: Grouping["concerns"]): Grouping {
  return { headline: "Widgets call the sprocket.", concerns };
}

describe("resolveGrouping", () => {
  it("accepts a grouping that places every item once", () => {
    const result = resolveGrouping(
      items,
      grouping([
        { title: "Sprocket", note: "Adds it.", files: [{ path: "src/widget.ts", hunks: [0] }, "src/gadget.ts"] },
        { title: "Call site", note: "Uses it.", files: [{ path: "src/widget.ts", hunks: [1] }] },
      ]),
      mechanical,
    );
    expect(result.violations).toEqual([]);
    expect(result.assignments.map((a) => [a.path, a.index, a.concern])).toEqual([
      ["src/widget.ts", 0, 0],
      ["src/widget.ts", 1, 1],
      ["src/gadget.ts", 0, 0],
    ]);
  });

  it("lets a concern claim a mechanical file", () => {
    const result = resolveGrouping(
      items,
      grouping([{ title: "All", note: "Everything.", files: ["src/widget.ts", "src/gadget.ts", "package-lock.json"] }]),
      mechanical,
    );
    expect(result.violations).toEqual([]);
    expect(result.assignments).toHaveLength(4);
  });

  it("reports a missing item", () => {
    const result = resolveGrouping(items, grouping([{ title: "Gadget", note: "n", files: ["src/gadget.ts"] }]), mechanical);
    expect(result.violations).toEqual([
      { kind: "missing", path: "src/widget.ts", index: 0 },
      { kind: "missing", path: "src/widget.ts", index: 1 },
    ]);
  });

  it("reports an item in two concerns", () => {
    const result = resolveGrouping(
      items,
      grouping([
        { title: "A", note: "n", files: ["src/widget.ts", "src/gadget.ts"] },
        { title: "B", note: "n", files: [{ path: "src/widget.ts", hunks: [1] }] },
      ]),
      mechanical,
    );
    expect(result.violations).toEqual([{ kind: "duplicate", path: "src/widget.ts", index: 1, concerns: [0, 1] }]);
  });

  it("ignores a file listed twice in the same concern", () => {
    const result = resolveGrouping(
      items,
      grouping([{ title: "A", note: "n", files: ["src/widget.ts", { path: "src/widget.ts", hunks: [0] }, "src/gadget.ts"] }]),
      mechanical,
    );
    expect(result.violations).toEqual([]);
  });

  it("reports unknown files and hunks, and a concern left empty by them", () => {
    const result = resolveGrouping(
      items,
      grouping([
        { title: "Real", note: "n", files: ["src/widget.ts", "src/gadget.ts"] },
        { title: "Ghost", note: "n", files: ["src/ghost.ts", { path: "src/gadget.ts", hunks: [5] }] },
      ]),
      mechanical,
    );
    expect(result.violations).toEqual([
      { kind: "unknown-file", path: "src/ghost.ts", concern: 1 },
      { kind: "unknown-hunk", path: "src/gadget.ts", index: 5, concern: 1 },
      { kind: "empty-concern", concern: 1 },
    ]);
  });
});

describe("formatViolation", () => {
  it("names the concern and says what to do", () => {
    const g = grouping([{ title: "Ghost", note: "n", files: ["src/ghost.ts"] }]);
    expect(formatViolation({ kind: "unknown-file", path: "src/ghost.ts", concern: 0 }, g)).toBe(
      'unknown file: "Ghost" names src/ghost.ts, which is not in the diff. Run `bb reviewmaxx hunks` for the file list.',
    );
    expect(formatViolation({ kind: "missing", path: "src/widget.ts", index: 1 }, g)).toBe(
      "missing: src/widget.ts#1 is in no concern. Add it to the concern it belongs to, or give it a small concern of its own.",
    );
  });
});

describe("parseGrouping", () => {
  it("rejects a grouping without a headline", () => {
    const result = parseGrouping({ concerns: [{ title: "A", note: "n", files: ["a"] }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.messages[0]).toMatch(/^headline:/);
  });
});

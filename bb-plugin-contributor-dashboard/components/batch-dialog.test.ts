import { describe, expect, it } from "vitest";

import { linksMarkdown, tickRange } from "./batch-dialog";

const ROWS = [{ number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }];

describe("tickRange", () => {
  it("ticks one row, or with shift every row from the last one clicked", () => {
    const one = tickRange(ROWS, new Set(), 0, null, false);
    expect([...one]).toEqual([1]);
    expect([...tickRange(ROWS, one, 3, 0, true)].sort()).toEqual([1, 2, 3, 4]);
  });

  it("unticks a range when the row shift-clicked was ticked", () => {
    expect([...tickRange(ROWS, new Set([1, 2, 3, 4]), 2, 0, true)]).toEqual([4]);
  });
});

describe("linksMarkdown", () => {
  it("writes one markdown link per row", () => {
    expect(linksMarkdown([{ number: 7, title: "Fix gadgets", url: "https://github.com/acme/widgets/pull/7" }])).toBe(
      "- [Fix gadgets (#7)](https://github.com/acme/widgets/pull/7)",
    );
  });
});

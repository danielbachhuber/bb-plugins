// @vitest-environment jsdom
//
// These tests encode the DOM contract the overlay depends on. The fixture in
// diff/fixture.ts mirrors what @pierre/diffs renders; if a bb or Pierre
// upgrade moves that shape, this file is where it surfaces, and the fix is to
// re-read DiffHunksRenderer and update the fixture and diff/dom.ts together.
import { afterEach, describe, expect, it } from "vitest";
import { buildDiff, buildPierreCard, gridRowsByLineIndex, shape, spanOf } from "./fixture";
import { cardHolder, insertRow, readLines, removeOwned, slotNameFor } from "./dom";

afterEach(() => {
  document.body.replaceChildren();
});

const SLOT = slotNameFor("c1");

describe("readLines", () => {
  it("reads line numbers and text from a unified column", () => {
    const { columns } = buildDiff({
      view: "unified",
      lines: [
        { line: 1, text: "const a = 1;" },
        { line: 2, text: "const b = 2;", type: "addition" },
      ],
    });
    expect(readLines(columns[0]!)).toEqual([
      { side: "new", line: 1, text: "const a = 1;" },
      { side: "new", line: 2, text: "const b = 2;" },
    ]);
  });

  it("calls a unified deletion an old-side line", () => {
    const { columns } = buildDiff({
      view: "unified",
      lines: [{ line: 4, text: "gone();", type: "deletion" }],
    });
    expect(readLines(columns[0]!)).toEqual([{ side: "old", line: 4, text: "gone();" }]);
  });

  it("reads each side of a split diff as its own side", () => {
    const { columns } = buildDiff({
      view: "split",
      old: [{ line: 7, text: "was();", type: "deletion" }],
      new: [{ line: 7, text: "is();", type: "addition" }],
    });
    expect(readLines(columns[0]!)).toEqual([{ side: "old", line: 7, text: "was();" }]);
    expect(readLines(columns[1]!)).toEqual([{ side: "new", line: 7, text: "is();" }]);
  });
});

describe("insertRow", () => {
  it("adds one row to both stacks so they stay the same length", () => {
    const { columns } = buildDiff({
      view: "unified",
      lines: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
        { line: 3, text: "c" },
      ],
    });
    expect(insertRow(columns[0]!, 2, "new", SLOT)).toBe(true);
    expect(shape(columns)).toEqual([[4, 4]]);
  });

  it("bumps grid-row on both stacks", () => {
    const { columns } = buildDiff({
      view: "unified",
      lines: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
      ],
    });
    insertRow(columns[0]!, 1, "new", SLOT);
    const code = columns[0]!;
    expect(spanOf(code.querySelector("[data-gutter]")!)).toBe(3);
    expect(spanOf(code.querySelector("[data-content]")!)).toBe(3);
  });

  it("puts the row directly below the line it belongs to", () => {
    const { columns } = buildDiff({
      view: "unified",
      lines: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
        { line: 3, text: "c" },
      ],
    });
    insertRow(columns[0]!, 2, "new", SLOT);
    const rows = Array.from(columns[0]!.querySelector("[data-content]")!.children);
    expect(rows[1]!.getAttribute("data-line")).toBe("2");
    expect(rows[2]!.hasAttribute("data-line-annotation")).toBe(true);
    expect(rows[2]!.querySelector("slot")!.getAttribute("name")).toBe(SLOT);
    expect(rows[3]!.getAttribute("data-line")).toBe("3");
  });

  it("adds a matching spacer to the other side of a split", () => {
    // The failure this plugin's spike actually hit: both sides of a split
    // share one grid, so a row on the left without a spacer on the right
    // pushes the two halves a row out of step.
    const { columns } = buildDiff({
      view: "split",
      old: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
      ],
      new: [
        { line: 1, text: "a" },
        { line: 2, text: "b2" },
      ],
    });
    insertRow(columns[0]!, 1, "old", SLOT);
    expect(shape(columns)).toEqual([
      [3, 3],
      [3, 3],
    ]);
    expect(spanOf(columns[1]!.querySelector("[data-content]")!)).toBe(3);
  });

  it("puts the spacer at the same index as the comment", () => {
    const { columns } = buildDiff({
      view: "split",
      old: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
        { line: 3, text: "c" },
      ],
      new: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
        { line: 3, text: "c" },
      ],
    });
    insertRow(columns[0]!, 2, "old", SLOT);
    const right = Array.from(columns[1]!.querySelector("[data-content]")!.children);
    expect(right[2]!.hasAttribute("data-line-annotation")).toBe(true);
    expect(right[3]!.getAttribute("data-line")).toBe("3");
  });

  it("goes under the line on the comment's side when two lines share a number", () => {
    const { columns } = buildDiff({
      view: "unified",
      lines: [
        { line: 2, text: "old", type: "deletion" },
        { line: 2, text: "new", type: "addition" },
      ],
    });
    insertRow(columns[0]!, 2, "new", SLOT);
    const rows = Array.from(columns[0]!.querySelector("[data-content]")!.children);
    expect(rows[1]!.getAttribute("data-line-type")).toBe("addition");
    expect(rows[2]!.querySelector("slot")!.getAttribute("name")).toBe(SLOT);
  });

  it("refuses a line that is not in the column", () => {
    const { columns } = buildDiff({ view: "unified", lines: [{ line: 1, text: "a" }] });
    expect(insertRow(columns[0]!, 99, "new", SLOT)).toBe(false);
    expect(shape(columns)).toEqual([[1, 1]]);
  });

  it("keeps stacks aligned across several comments", () => {
    const { columns } = buildDiff({
      view: "split",
      old: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
        { line: 3, text: "c" },
      ],
      new: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
        { line: 3, text: "c" },
      ],
    });
    insertRow(columns[0]!, 1, "old", SLOT);
    insertRow(columns[1]!, 3, "new", slotNameFor("c2"));
    insertRow(columns[0]!, 3, "old", slotNameFor("c3"));
    expect(shape(columns)).toEqual([
      [6, 6],
      [6, 6],
    ]);
  });
});

describe("removeOwned", () => {
  it("puts the DOM back exactly as it was", () => {
    const { root, columns } = buildDiff({
      view: "split",
      old: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
      ],
      new: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
      ],
    });
    const before = shape(columns);
    insertRow(columns[0]!, 1, "old", SLOT);
    expect(removeOwned(root)).toBe(4); // comment row + gutter cell, spacer row + gutter cell
    expect(shape(columns)).toEqual(before);
    expect(spanOf(columns[0]!.querySelector("[data-content]")!)).toBe(2);
    expect(spanOf(columns[1]!.querySelector("[data-gutter]")!)).toBe(2);
  });

  it("removes nothing from an untouched diff", () => {
    const { root } = buildDiff({ view: "unified", lines: [{ line: 1, text: "a" }] });
    expect(removeOwned(root)).toBe(0);
  });
});

describe("cardHolder", () => {
  it("creates a light-DOM holder on the host, matching the row's slot", () => {
    const { host, columns } = buildDiff({ view: "unified", lines: [{ line: 1, text: "a" }] });
    insertRow(columns[0]!, 1, "new", slotNameFor("c1"));
    const holder = cardHolder(host, "c1");
    expect(holder.getAttribute("slot")).toBe(slotNameFor("c1"));
    expect(holder.parentElement).toBe(host);
  });

  it("keeps the holder outside the shadow root, so app styles still reach it", () => {
    const { host, root } = buildDiff({ view: "unified", lines: [{ line: 1, text: "a" }] });
    const holder = cardHolder(host, "c1");
    expect(root.contains(holder)).toBe(false);
  });

  it("returns the same holder for the same comment", () => {
    const { host } = buildDiff({ view: "unified", lines: [{ line: 1, text: "a" }] });
    expect(cardHolder(host, "c1")).toBe(cardHolder(host, "c1"));
  });

  it("is cleaned up with everything else, without touching a grid span", () => {
    const { host, columns } = buildDiff({
      view: "unified",
      lines: [
        { line: 1, text: "a" },
        { line: 2, text: "b" },
      ],
    });
    insertRow(columns[0]!, 1, "new", slotNameFor("c1"));
    cardHolder(host, "c1");
    // Passing the host cleans both sides of the shadow boundary: the card
    // holder in the light DOM and the row and gutter cell inside.
    expect(removeOwned(host)).toBe(3);
    expect(spanOf(columns[0]!.querySelector("[data-content]")!)).toBe(2);
    expect(host.querySelector("[slot]")).toBeNull();
  });
});

describe("readLines and the hover affordance", () => {
  it("does not read the affordance's own glyph as part of the line", () => {
    // The trigger is appended into the hovered row. Reading it as code text
    // would store it in the comment's anchor, which then never matches the
    // real line again.
    const { columns } = buildDiff({ view: "unified", lines: [{ line: 1, text: "const a = 1;" }] });
    const row = columns[0]!.querySelector("[data-line]")!;
    const trigger = document.createElement("button");
    trigger.setAttribute("data-diff-comment-trigger", "");
    trigger.textContent = "+";
    row.append(trigger);

    expect(readLines(columns[0]!)[0]!.text).toBe("const a = 1;");
  });
});

describe("insertRow on a diff Pierre rendered", () => {
  // Lines added after "two", "four" removed, and "six" changed: a hunk with
  // nothing on the old side, one with nothing on the new side, and a
  // modification. The first two are where Pierre draws a buffer spanning
  // several rows instead of one row per line.
  const OLD = "one\ntwo\nthree\nfour\nfive\nsix\n";
  const NEW = "one\ntwo\nadd1\nadd2\nadd3\nthree\nfive\nsix changed\n";

  /** Every line in each column, as [column index, side, line number]. */
  function targets(columns: HTMLElement[]): Array<[number, "old" | "new", number]> {
    return columns.flatMap((code, at) =>
      readLines(code).map((line): [number, "old" | "new", number] => [at, line.side, line.line]),
    );
  }

  function contentRows(code: Element): Element[] {
    return Array.from(code.querySelector("[data-content]")!.children);
  }

  it.each(["split", "unified"] as const)(
    "puts the row under every line in %s view and keeps the columns in step",
    async (view) => {
      const first = await buildPierreCard("src/a.ts", { view, old: OLD, new: NEW });
      const all = targets(first.columns);
      expect(all.length).toBeGreaterThan(0);
      document.body.replaceChildren();

      for (const [at, side, line] of all) {
        const { columns } = await buildPierreCard("src/a.ts", { view, old: OLD, new: NEW });
        const code = columns[at]!;
        expect(insertRow(code, line, side, SLOT)).toBe(true);

        // The comment row is the next child after its line.
        const rows = contentRows(code);
        const index = rows.findIndex((row) => row.querySelector(`slot[name="${SLOT}"]`) !== null);
        expect(rows[index - 1]!.getAttribute("data-line")).toBe(String(line));

        // Gutter and content stacks still match, child for child.
        for (const column of columns) {
          const [cells, contents] = shape([column])[0]!;
          expect(cells).toBe(contents);
        }

        // Every line still sits beside its partner on the other side.
        if (view === "split") {
          const left = gridRowsByLineIndex(columns[0]!);
          const right = gridRowsByLineIndex(columns[1]!);
          for (const [lineIndex, row] of left) {
            if (right.has(lineIndex)) expect([lineIndex, right.get(lineIndex)]).toEqual([lineIndex, row]);
          }
          expect(spanOf(columns[0]!.querySelector("[data-content]")!)).toBe(
            spanOf(columns[1]!.querySelector("[data-content]")!),
          );
        }
        document.body.replaceChildren();
      }
    },
  );

  it("puts the DOM back exactly as it was after a row inside a buffer", async () => {
    const { root, columns } = await buildPierreCard("src/a.ts", {
      view: "split",
      old: OLD,
      new: NEW,
    });
    const before = root.innerHTML;
    // "add2" is mid-hunk, so the old side's spacer lands inside its buffer.
    insertRow(columns[1]!, 4, "new", SLOT);
    removeOwned(root);
    expect(root.innerHTML).toBe(before);
  });
});

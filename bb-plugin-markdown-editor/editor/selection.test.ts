import { describe, expect, it } from "vitest";
import {
  ANCHOR_GAP,
  ANCHOR_HEIGHT,
  ANCHOR_WIDTH,
  anchorForSelection,
  normalizeSelectedText,
  quoteForSelection,
} from "./selection";

describe("quoteForSelection", () => {
  it("puts the path above a blank line so addQuote makes one blockquote", () => {
    expect(quoteForSelection("/acme/widgets/README.md", "Only babel-jest moves.")).toBe(
      "/acme/widgets/README.md\n\nOnly babel-jest moves.",
    );
  });

  it("keeps a paragraph break inside the selection", () => {
    const quote = quoteForSelection("/acme/widgets/notes.md", "First.\n\nSecond.");
    expect(quote).toBe("/acme/widgets/notes.md\n\nFirst.\n\nSecond.");
  });

  it("declines a selection that is only whitespace", () => {
    expect(quoteForSelection("/acme/widgets/README.md", "   \n\n\t ")).toBeNull();
  });

  it("declines an empty selection", () => {
    expect(quoteForSelection("/acme/widgets/README.md", "")).toBeNull();
  });
});

describe("normalizeSelectedText", () => {
  it("collapses the blank-line run a selection across a heading picks up", () => {
    expect(normalizeSelectedText("Intro.\n\n\n\nWhat changed\n\n\nBody.")).toBe(
      "Intro.\n\nWhat changed\n\nBody.",
    );
  });

  it("strips trailing spaces the renderer leaves on wrapped lines", () => {
    expect(normalizeSelectedText("one  \ntwo\t\nthree")).toBe("one\ntwo\nthree");
  });

  it("normalizes CRLF to LF", () => {
    expect(normalizeSelectedText("one\r\ntwo\rthree")).toBe("one\ntwo\nthree");
  });

  it("leaves indentation at the start of a line alone", () => {
    expect(normalizeSelectedText("- item\n  - nested")).toBe("- item\n  - nested");
  });
});

/** A pane 400px tall at viewport (100, 50), scrolled 200px down. */
const pane = { left: 100, top: 50, height: 400 };
const scroll = { left: 0, top: 200 };
const clientWidth = 600;

describe("anchorForSelection", () => {
  it("sits below the selection, in the scroller's own coordinates", () => {
    const { left, top } = anchorForSelection({
      selection: { left: 140, top: 100, bottom: 120 },
      pane,
      scroll,
      clientWidth,
    });
    expect(left).toBe(40);
    expect(top).toBe(120 - 50 + ANCHOR_GAP + 200);
  });

  it("flips above a selection too near the foot of the pane to fit below", () => {
    // Pane runs 50..450 in the viewport; a selection ending at 440 has no room.
    const { top } = anchorForSelection({
      selection: { left: 140, top: 420, bottom: 440 },
      pane,
      scroll,
      clientWidth,
    });
    expect(top).toBe(420 - 50 - ANCHOR_GAP - ANCHOR_HEIGHT + 200);
  });

  it("keeps the button inside the right edge of a selection starting far right", () => {
    const { left } = anchorForSelection({
      selection: { left: 690, top: 100, bottom: 120 },
      pane,
      scroll,
      clientWidth,
    });
    expect(left).toBe(clientWidth - ANCHOR_WIDTH - ANCHOR_GAP);
  });

  it("keeps the button inside the left edge of a selection starting off-pane", () => {
    const { left } = anchorForSelection({
      selection: { left: 80, top: 100, bottom: 120 },
      pane,
      scroll,
      clientWidth,
    });
    expect(left).toBe(ANCHOR_GAP);
  });

  it("does not push the button off the left edge of a pane narrower than itself", () => {
    const { left } = anchorForSelection({
      selection: { left: 140, top: 100, bottom: 120 },
      pane,
      scroll: { left: 0, top: 0 },
      clientWidth: 60,
    });
    expect(left).toBe(ANCHOR_GAP);
  });
});

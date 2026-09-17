// Turning a preview selection into a composer quote, and deciding where the
// button that does it should sit.
//
// Both rules live here rather than in app.tsx because both are easy to get
// subtly wrong and neither needs a DOM: the quote's shape decides what an
// agent reads, and the anchor math decides whether the button lands on top of
// the words it refers to or off the edge of the pane.

/** Gap in px between the selection and the button, and between button and pane edge. */
export const ANCHOR_GAP = 6;

/**
 * Width in px the anchor math assumes the button occupies.
 *
 * Measuring the rendered button would be exact but circular — it has to be
 * positioned before it can be measured — and the number is only ever used to
 * keep the button from hanging off the right edge, where being a few pixels
 * conservative costs nothing.
 */
export const ANCHOR_WIDTH = 116;

/** Height in px the anchor math assumes the button occupies. See `ANCHOR_WIDTH`. */
export const ANCHOR_HEIGHT = 28;

/**
 * The text a selection contributes to the composer, or null when there is
 * nothing worth sending.
 *
 * Selections that are only whitespace are the common accident: a click that
 * drags a pixel, or a double-click landing between two blocks. They produce a
 * range with a rect and so would otherwise get a button that quotes nothing.
 *
 * The path goes on its own line above a blank one. `addQuote` prefixes every
 * line with `> `, so the result is a single blockquote whose first line names
 * the file — without that, a paragraph lifted out of a document arrives in the
 * composer with no indication of where it came from.
 */
export function quoteForSelection(path: string, selected: string): string | null {
  const text = normalizeSelectedText(selected);
  if (text === "") return null;
  return `${path}\n\n${text}`;
}

/**
 * A selected range as the composer should read it.
 *
 * Rendered markdown puts real newlines in the selection where the source had
 * hard wraps, and a selection that crosses a heading picks up the blank lines
 * around it. Runs of three or more newlines collapse to the two that separate
 * paragraphs; anything shorter is left alone, because a two-newline gap in the
 * selection is a paragraph break the author meant.
 */
export function normalizeSelectedText(selected: string): string {
  return selected
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface AnchorInput {
  /** The selection's bounding box, in viewport coordinates. */
  selection: { left: number; top: number; bottom: number };
  /** The scrolling preview pane's box, in viewport coordinates. */
  pane: { left: number; top: number; height: number };
  /** How far the preview pane is scrolled. */
  scroll: { left: number; top: number };
  /** The pane's visible width, excluding any scrollbar. */
  clientWidth: number;
}

/**
 * Where to place the button inside the preview pane's scrolling box.
 *
 * The coordinates are relative to the scrolled content, not the viewport, so
 * the button is a child of the scroller and travels with the text it points
 * at instead of needing a scroll listener to chase it.
 *
 * Below the selection is the default, because that is the empty direction for
 * a downward drag and it does not cover what was just read. A selection whose
 * bottom is near the foot of the pane flips above itself, since a button
 * placed past the visible bottom of a scroller is a button nobody can click.
 */
export function anchorForSelection(input: AnchorInput): { left: number; top: number } {
  const { selection, pane, scroll, clientWidth } = input;

  const belowTop = selection.bottom - pane.top + ANCHOR_GAP;
  const fitsBelow = belowTop + ANCHOR_HEIGHT + ANCHOR_GAP <= pane.height;
  const top =
    (fitsBelow ? belowTop : selection.top - pane.top - ANCHOR_GAP - ANCHOR_HEIGHT) +
    scroll.top;

  const rightmost = Math.max(ANCHOR_GAP, clientWidth - ANCHOR_WIDTH - ANCHOR_GAP);
  const left =
    Math.min(Math.max(selection.left - pane.left, ANCHOR_GAP), rightmost) + scroll.left;

  return { left, top };
}

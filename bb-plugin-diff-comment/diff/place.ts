// Deciding where each comment goes in a rendered diff.
//
// Kept separate from the DOM mutation and the React mounting so the decision
// can be tested on its own: given the comments for a file and the lines a diff
// is currently showing, which column does each comment land in, on which line,
// and which comments have lost their anchor entirely.
import { locate } from "@/comment/anchor";
import type { Comment, DiffLine } from "@/comment/types";

/** One column of a rendered diff, with the lines it is showing. */
export interface Column {
  element: Element;
  lines: DiffLine[];
}

export interface Placement {
  comment: Comment;
  /** The column the comment's row goes into. */
  column: Element;
  /** The line in that column to sit below. */
  line: number;
}

export interface PlacementResult {
  placements: Placement[];
  /** Comments whose code is no longer anywhere in this diff. */
  detached: Comment[];
}

/**
 * Place every comment for one file.
 *
 * A comment is placed in the column that actually renders its side. In split
 * view that is one of the two columns; in unified view a single column carries
 * both sides, so the side check happens per line inside `locate`.
 *
 * Resolved comments are not placed. They stay in the panel, but leaving them
 * on the diff would mean the diff never gets quieter as you work through a
 * review, which is the opposite of the point.
 */
export function placeComments(comments: Comment[], columns: Column[]): PlacementResult {
  const placements: Placement[] = [];
  const detached: Comment[] = [];

  for (const comment of comments) {
    if (comment.state === "resolved") continue;

    let found: Placement | null = null;
    for (const column of columns) {
      const line = locate(comment, column.lines);
      if (line === null) continue;
      found = { comment, column: column.element, line };
      break;
    }

    if (found === null) detached.push(comment);
    else placements.push(found);
  }

  return { placements, detached };
}

/**
 * A stable description of a set of placements, used to decide whether the DOM
 * needs rebuilding. Comparing this instead of rebuilding every pass is what
 * keeps bb's own re-renders — which fire constantly — from tearing down and
 * remounting every comment card.
 */
export function placementKey(placements: Placement[], columns: Column[]): string {
  return placements
    .map((placement) => {
      const columnIndex = columns.findIndex((column) => column.element === placement.column);
      // `updatedAt` is in the key so an edited body or a new reply redraws the
      // card. Without it, a change that moves neither the line nor the state —
      // editing the text — would leave the old card on screen.
      return [
        placement.comment.id,
        `@${columnIndex}:${placement.line}`,
        placement.comment.state,
        placement.comment.updatedAt,
      ].join(":");
    })
    .sort()
    .join("|");
}

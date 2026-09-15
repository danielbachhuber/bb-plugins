// Finding a comment's line again after the code under it has changed.
//
// The overlay re-runs this on every render. A comment stores the text of its
// line plus the line above and below; this scores every line in the current
// diff against that and picks a winner, or reports that there is none.
//
// Why not just trust the line number: the whole point of the plugin is that an
// agent edits the file while comments are open. Line numbers are the first
// thing to go stale. Why not trust the text alone: `}` is not a location. The
// two together, plus proximity as a tie-break, are what make this stable.
import type { Comment, DiffLine } from "./types";

/** Indentation moves around under a formatter; it should not detach a comment. */
function normalize(text: string): string {
  return text.trim();
}

/** How strongly a candidate line matches the comment's remembered context. */
function score(comment: Comment, lines: DiffLine[], index: number): number {
  const { anchor } = comment;
  const candidate = lines[index];
  if (candidate === undefined) return 0;

  // The line's own text is the primary signal, but only when it has content.
  // A blank anchor matches every blank line, which is no information at all.
  const own = normalize(anchor.text);
  if (own !== "" && normalize(candidate.text) !== own) return 0;
  if (own === "" && normalize(candidate.text) !== "") return 0;

  let points = own === "" ? 0 : 2;

  // Neighbours only count within the same side, and only when the comment
  // remembered one. Missing context is neutral, not evidence against.
  const previous = lines[index - 1];
  const next = lines[index + 1];
  if (anchor.before !== null && previous?.side === candidate.side) {
    if (normalize(previous.text) === normalize(anchor.before)) points += 1;
  }
  if (anchor.after !== null && next?.side === candidate.side) {
    if (normalize(next.text) === normalize(anchor.after)) points += 1;
  }
  return points;
}

/**
 * The line number in `lines` this comment now belongs on, or null when the
 * code it was written about is no longer in the diff. Null is a state the UI
 * shows ("detached"), not an error.
 */
export function locate(comment: Comment, lines: DiffLine[]): number | null {
  let best: { line: number; points: number; distance: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines[index]!;
    if (candidate.side !== comment.side) continue;

    const points = score(comment, lines, index);
    if (points === 0) continue;

    const distance = Math.abs(candidate.line - comment.line);
    // Better context wins outright; equal context falls back to whichever
    // sits closest to where the comment was originally left.
    if (best === null || points > best.points || (points === best.points && distance < best.distance)) {
      best = { line: candidate.line, points, distance };
    }
  }

  return best?.line ?? null;
}

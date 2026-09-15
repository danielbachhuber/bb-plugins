// Turning comments into the text an agent reads in a terminal.
//
// The agent's whole view of a comment is this output, so it carries the
// reference to pass back, where the comment sits, the code it was left on, and
// what was written. Nothing else.
import type { Comment } from "./types";

/** How a comment is referred to on the command line. */
export type CommentRef = { kind: "seq"; seq: number } | { kind: "id"; id: string };

/** Ids are hex slices of a uuid; this is deliberately stricter than "any string". */
const ID_PATTERN = /^[0-9a-z]{4,}$/i;

/**
 * Read `#2`, `2`, or an id. Sequence numbers are what the listing shows, so
 * they are what an agent reaches for; ids stay accepted because they are what
 * the UI and the RPC layer use.
 *
 * Anything that is neither — `-3`, a stray flag, a path — is rejected here
 * rather than passed along to fail later as "no such comment", which would
 * read as though the comment had been deleted.
 */
export function parseRef(raw: string): CommentRef | null {
  const text = raw.trim();
  if (text === "") return null;

  const numeric = /^#?(\d+)$/.exec(text);
  if (numeric !== null) {
    const seq = Number(numeric[1]);
    return seq > 0 ? { kind: "seq", seq } : null;
  }
  return ID_PATTERN.test(text) ? { kind: "id", id: text } : null;
}

/** Find the comment a reference points at. */
export function resolveRef(comments: Comment[], ref: CommentRef): Comment | null {
  if (ref.kind === "seq") {
    return comments.find((comment) => comment.seq === ref.seq) ?? null;
  }
  return comments.find((comment) => comment.id === ref.id) ?? null;
}

function firstLine(body: string): string {
  return body.split("\n").find((line) => line.trim() !== "")?.trim() ?? "";
}

export interface RowOptions {
  /** True when the commented code is no longer anywhere in the diff. */
  detached?: boolean;
}

/** One comment as a single line, for `bb diff-comment list`. */
export function formatRow(comment: Comment, options: RowOptions = {}): string {
  const where = `${comment.path}:${comment.line}`;
  // Only the old side is called out. Most comments are on the new side, and
  // labelling every one of them adds noise to the common case.
  const side = comment.side === "old" ? " (old)" : "";
  const detached = options.detached === true ? " [detached]" : "";
  return `#${comment.seq}  ${comment.state.padEnd(9)}  ${where}${side}${detached}  ${firstLine(comment.body)}`;
}

/** The commented line and its neighbours, as a quoted snippet. */
function snippet(comment: Comment): string[] {
  const { anchor, line } = comment;
  const width = String(line + 1).length + 3;
  const row = (n: number, marker: string, text: string) =>
    `${String(n).padStart(width)} | ${marker} ${text}`;

  const lines: string[] = [];
  if (anchor.before !== null) lines.push(row(line - 1, " ", anchor.before));
  lines.push(row(line, ">", anchor.text));
  if (anchor.after !== null) lines.push(row(line + 1, " ", anchor.after));
  return lines;
}

/** One comment in full, for `bb diff-comment show` and `next`. */
export function formatDetail(comment: Comment, options: RowOptions = {}): string {
  const side = comment.side === "old" ? " (old)" : "";
  const detached = options.detached === true ? "  [detached]" : "";
  const parts = [
    `#${comment.seq}  ${comment.state}  ${comment.path}:${comment.line}${side}${detached}`,
    "",
    ...snippet(comment),
    "",
    comment.body.trim(),
  ];
  if (comment.reply !== null) {
    parts.push("", `Reply: ${comment.reply.trim()}`);
  }
  return parts.join("\n");
}

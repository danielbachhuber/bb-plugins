// The shape of a comment, shared by the server, the CLI, and the diff overlay.
//
// A comment belongs to a thread, because that is what a changes-panel diff
// belongs to. Everything else on the record exists to answer one of two
// questions: where does this comment sit in the diff, and where has it got to
// in the review loop.

/** Which side of the diff a comment was placed on. */
export type Side = "old" | "new";

/**
 * Where a comment is in the review loop.
 *
 * - `open`      — written, not yet worked
 * - `addressed` — the agent changed something and said what; waiting on you
 * - `resolved`  — you accepted it
 *
 * The agent may move `open` to `addressed` and nothing else. Only a person
 * resolves, so "addressed" is a real checkpoint rather than a formality.
 */
export type CommentState = "open" | "addressed" | "resolved";

/** The lines stored either side of a comment's own line, for re-anchoring. */
export interface AnchorContext {
  /** Text of the commented line itself. */
  text: string;
  /** The line above it, or null at the top of a hunk. */
  before: string | null;
  /** The line below it, or null at the bottom of a hunk. */
  after: string | null;
}

export interface Comment {
  id: string;
  threadId: string;
  /** Worktree-relative path, as bb's diff reports it. */
  path: string;
  side: Side;
  /** The line number the comment was placed on, at the time it was written. */
  line: number;
  anchor: AnchorContext;
  /** What you wrote. Markdown. */
  body: string;
  state: CommentState;
  /** What the agent said it did. Markdown. Null until it replies. */
  reply: string | null;
  /** Monotonic per thread, so "work through them in order" is well defined. */
  seq: number;
  createdAt: string;
  updatedAt: string;
}

/** A rendered diff line, as the overlay reads it out of the DOM. */
export interface DiffLine {
  side: Side;
  line: number;
  text: string;
}

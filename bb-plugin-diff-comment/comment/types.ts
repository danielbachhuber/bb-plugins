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

/** One turn after the comment itself: an answer, or your reply to one. */
export interface CommentMessage {
  author: "you" | "agent";
  /** Markdown. */
  body: string;
  at: string;
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
  /** The agent's latest answer. Markdown. Null until it replies. */
  reply: string | null;
  /**
   * Every answer and every reply to one, oldest first, after `body`. Absent on
   * a comment stored before replying to the agent existed, whose one answer
   * is `reply`; `conversation()` reads either.
   */
  messages?: CommentMessage[];
  /** Monotonic per thread, so "work through them in order" is well defined. */
  seq: number;
  /**
   * Set once the comment and the agent's answer were posted to the pull
   * request as a draft review comment. Absent on comments stored before
   * posting existed.
   */
  github?: { url: string } | null;
  /**
   * When the comment was last sent to the agent with Ask agent. Cleared when
   * it is reopened, so it can be asked again. Absent on older comments.
   */
  askedAt?: string | null;
  /** The subthread Ask agent started to answer it, when it started one. */
  askThreadId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A rendered diff line, as the overlay reads it out of the DOM. */
export interface DiffLine {
  side: Side;
  line: number;
  text: string;
}

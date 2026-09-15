// Pure operations over a thread's comments.
//
// No storage, no clock, no ids of its own: the caller passes `now` and `id` in.
// That is what makes the review loop testable without a server, and it is the
// same split the sweeps use.
import type { AnchorContext, Comment, CommentState, Side } from "./types";

export interface NewComment {
  threadId: string;
  path: string;
  side: Side;
  line: number;
  anchor: AnchorContext;
  body: string;
  /** Caller-supplied so tests are deterministic. */
  now: string;
  id: string;
}

/** Comments in the order the agent should work them. */
export function ordered(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => a.seq - b.seq);
}

/**
 * Append a comment. Its seq is one above the highest in the list rather than
 * the list's length, so deleting a comment cannot make a later one reuse a
 * number that has already been referred to.
 */
export function addComment(comments: Comment[], input: NewComment): Comment[] {
  const highest = comments.reduce((max, comment) => Math.max(max, comment.seq), 0);
  const comment: Comment = {
    id: input.id,
    threadId: input.threadId,
    path: input.path,
    side: input.side,
    line: input.line,
    anchor: input.anchor,
    body: input.body,
    state: "open",
    reply: null,
    seq: highest + 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return [...comments, comment];
}

function update(
  comments: Comment[],
  id: string,
  change: (comment: Comment) => Comment,
): Comment[] {
  let found = false;
  const next = comments.map((comment) => {
    if (comment.id !== id) return comment;
    found = true;
    return change(comment);
  });
  // An unknown id is not an error here; the CLI turns it into one, with a
  // message that tells you how to find the real ids.
  return found ? next : comments;
}

/**
 * Record what the agent did and move the comment to `addressed`. This is the
 * only state change the agent makes — resolving stays with the person who
 * wrote the comment.
 */
export function applyReply(
  comments: Comment[],
  id: string,
  reply: string,
  now: string,
): Comment[] {
  return update(comments, id, (comment) => ({
    ...comment,
    reply,
    state: "addressed",
    updatedAt: now,
  }));
}

export function setState(
  comments: Comment[],
  id: string,
  state: CommentState,
  now: string,
): Comment[] {
  return update(comments, id, (comment) => ({ ...comment, state, updatedAt: now }));
}

/** The comment the agent should pick up next, or null when the queue is empty. */
export function nextOpen(comments: Comment[]): Comment | null {
  return ordered(comments).find((comment) => comment.state === "open") ?? null;
}

export interface CommentSummary {
  open: number;
  addressed: number;
  resolved: number;
  total: number;
}

export function summarize(comments: Comment[]): CommentSummary {
  return comments.reduce<CommentSummary>(
    (totals, comment) => ({
      ...totals,
      [comment.state]: totals[comment.state] + 1,
      total: totals.total + 1,
    }),
    { open: 0, addressed: 0, resolved: 0, total: 0 },
  );
}

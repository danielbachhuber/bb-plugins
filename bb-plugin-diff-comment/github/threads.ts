// The pull request's own review threads, as this plugin draws them.
//
// Pure: the server fetches the GraphQL payload and hands it here. Nothing in
// this file talks to GitHub, which is what lets the anchoring rules be tested
// against a real payload's shape without a network.
//
// A GitHub thread is placed on bb's diff the same way a local comment is: by
// the text of its line and the line above, matched against what bb rendered.
// GitHub does not report a thread's line text directly, but every comment
// carries a `diffHunk` whose last line is the line it was written on. That is
// what lets a thread follow its code through unpushed edits, where GitHub's
// own line number no longer matches what bb shows.
import type { AnchorContext, Side } from "@/comment/types";

export interface GithubComment {
  id: string;
  url: string;
  /** The author's login, or null for a deleted account. */
  author: string | null;
  /** Markdown. */
  body: string;
  createdAt: string;
  /** A draft on a review the viewer has not submitted yet. Only they see it. */
  pending: boolean;
}

export interface GithubThread {
  id: string;
  path: string;
  side: Side;
  /**
   * Where GitHub places the thread on the pull request's current diff, or
   * where it was first written when the code has since moved. Null for a
   * comment on the whole file.
   */
  line: number | null;
  /** The line's text and the line above it, read from the diff hunk. */
  anchor: AnchorContext | null;
  resolved: boolean;
  /** GitHub's own judgement that the code changed under it on a later push. */
  outdated: boolean;
  comments: GithubComment[];
}

/** The thread's pull request, and its threads. */
export interface GithubReview {
  number: number;
  url: string;
  threads: GithubThread[];
}

/** One review thread as the GraphQL query returns it. */
export interface RawThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  originalLine: number | null;
  diffSide: "LEFT" | "RIGHT";
  subjectType?: "LINE" | "FILE" | null;
  comments: {
    nodes: Array<{
      id: string;
      url: string;
      body: string;
      createdAt: string;
      state: string;
      author: { login: string } | null;
      diffHunk: string;
    }>;
  };
}

/**
 * The commented line, and the one above it on the same side, from a diff
 * hunk. GitHub ends a comment's hunk at the line it was left on, so the last
 * line is the anchor. Returns null when the hunk does not end on the given
 * side, which would mean the payload is not what this assumes.
 */
export function anchorFromHunk(hunk: string, side: Side): AnchorContext | null {
  const lines = hunk.split("\n").filter((line) => !line.startsWith("@@"));
  // A hunk may end with "\ No newline at end of file", or a trailing newline,
  // and neither is a line of the file.
  while (lines.length > 0 && /^(\\|$)/.test(lines[lines.length - 1]!)) lines.pop();

  const onSide = (line: string) =>
    line.startsWith(" ") || line.startsWith(side === "new" ? "+" : "-");

  const last = lines[lines.length - 1];
  if (last === undefined || !onSide(last)) return null;

  let before: string | null = null;
  for (let index = lines.length - 2; index >= 0; index -= 1) {
    const candidate = lines[index]!;
    if (!onSide(candidate)) continue;
    before = candidate.slice(1);
    break;
  }

  return { text: last.slice(1), before, after: null };
}

export function toThread(raw: RawThread): GithubThread {
  const side: Side = raw.diffSide === "LEFT" ? "old" : "new";
  const first = raw.comments.nodes[0];
  const fileLevel = raw.subjectType === "FILE";
  return {
    id: raw.id,
    path: raw.path,
    side,
    line: fileLevel ? null : (raw.line ?? raw.originalLine),
    anchor: fileLevel || first === undefined ? null : anchorFromHunk(first.diffHunk, side),
    resolved: raw.isResolved,
    outdated: raw.isOutdated,
    comments: raw.comments.nodes.map((node) => ({
      id: node.id,
      url: node.url,
      author: node.author?.login ?? null,
      body: node.body,
      createdAt: node.createdAt,
      pending: node.state === "PENDING",
    })),
  };
}

/**
 * The path GitHub knows a file by. bb labels a rename `previous -> current`;
 * GitHub files its threads under the current path.
 */
export function githubPath(label: string): string {
  const arrow = label.lastIndexOf(" -> ");
  return arrow === -1 ? label : label.slice(arrow + 4);
}

/**
 * Whether a thread belongs on the diff at all. A resolved thread is left off,
 * as GitHub collapses it and as a resolved local comment is left off. So is an
 * outdated one, which GitHub only shows in the conversation, and a comment on
 * the whole file, which has no line to sit under.
 */
export function drawable(
  thread: GithubThread,
): thread is GithubThread & { line: number; anchor: AnchorContext } {
  return (
    !thread.resolved &&
    !thread.outdated &&
    thread.line !== null &&
    thread.anchor !== null &&
    thread.comments.length > 0
  );
}

/** The link that opens the thread on GitHub: its first comment. */
export function threadUrl(thread: GithubThread): string | null {
  return thread.comments[0]?.url ?? null;
}

/**
 * How many of an issue's comments count as seen, given who wrote each one.
 *
 * A comment you wrote is not new to you, and neither is anything before it:
 * you read the thread to reply to it. So the seen count moves up to just past
 * your latest comment, and only what others wrote after that stays new. It
 * never moves down, so a deleted comment cannot make old ones new again.
 */
export function seenThroughOwn(authors: readonly string[], seen: number, viewer: string): number {
  const own = viewer.toLowerCase();
  let last = -1;
  authors.forEach((author, index) => {
    if (author.toLowerCase() === own) last = index;
  });
  return Math.max(seen, last + 1);
}

/** One comment on an issue, as its drawer draws it. */
export interface IssueComment {
  author: string;
  avatarUrl: string;
  body: string;
  url: string;
  at: number;
}

/** How many comments the drawer reads: the latest ones, which hold anything new. */
export const COMMENTS_LIMIT = 50;

export const COMMENTS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      comments(last: ${COMMENTS_LIMIT}) {
        totalCount
        nodes { author { login avatarUrl } bodyText url createdAt }
      }
    }
  }
}`;

interface RawComment {
  author?: { login?: string; avatarUrl?: string } | null;
  bodyText?: string;
  url?: string;
  createdAt?: string;
}

/**
 * The latest comments, oldest first, and how many the issue has in all. A
 * deleted account's comment keeps its place, under "ghost", so the new ones
 * still line up with the end of the list.
 */
export function parseComments(raw: string): { comments: IssueComment[]; total: number } {
  const parsed = JSON.parse(raw) as {
    data?: {
      repository?: {
        issue?: { comments?: { totalCount?: number; nodes?: Array<RawComment | null> | null } } | null;
      } | null;
    };
  };
  const connection = parsed.data?.repository?.issue?.comments;
  const comments = (connection?.nodes ?? []).flatMap((node) => {
    if (!node) return [];
    const at = node.createdAt ? Date.parse(node.createdAt) : NaN;
    return [
      {
        author: node.author?.login ?? "ghost",
        avatarUrl: node.author?.avatarUrl ?? "",
        body: node.bodyText?.trim() ?? "",
        url: node.url ?? "",
        at: Number.isNaN(at) ? 0 : at,
      },
    ];
  });
  return { comments, total: connection?.totalCount ?? comments.length };
}

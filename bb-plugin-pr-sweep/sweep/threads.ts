import type { GhRunner } from "@danielb/gh-shared/gh";

/** Unresolved inline review threads on one pull request. */
export interface ThreadCounts {
  unresolved: number;
  /** Of the unresolved ones, how many sit on code that has since changed. */
  outdated: number;
  /**
   * Of the unresolved ones, how many you answered last. Threads often stay
   * unresolved after a reply, so a reply is read as answering the thread.
   */
  replied: number;
  /**
   * Who wrote the last comment on each thread still unanswered, most threads
   * first, then alphabetical: the people waiting on a reply.
   */
  unansweredBy: string[];
  /**
   * Every inline comment, resolved threads included: there are inline
   * comments to read even when none is still waiting on you.
   */
  inlineComments: number;
}

/**
 * The swept pull requests by node id, rather than a search for every open pull
 * request you authored. GitHub charges a query for the most nodes it could
 * return, so a `search(first: 100)` around `reviewThreads(first: 100)` costs
 * about 100 points however few pull requests there are. Asking for the rows
 * themselves costs about one point each, and leaves out the repositories the
 * filter skipped.
 */
export const THREADS_QUERY = `
query($ids: [ID!]!) {
  viewer { login }
  nodes(ids: $ids) {
    ... on PullRequest {
      number
      repository { nameWithOwner }
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          comments(last: 1) { totalCount nodes { author { login } } }
        }
      }
    }
  }
}`;

/** The most ids `nodes` accepts in one call. */
export const THREADS_BATCH = 100;

/** `repo#number`, the key rows are already stored under. */
export function threadKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

interface RawNode {
  number?: number;
  repository?: { nameWithOwner?: string };
  reviewThreads?: {
    nodes?: Array<{
      isResolved?: boolean;
      isOutdated?: boolean;
      comments?: { totalCount?: number; nodes?: Array<{ author?: { login?: string } | null } | null> | null };
    } | null> | null;
  };
}

export function parseThreadCounts(raw: string): Map<string, ThreadCounts> {
  const counts = new Map<string, ThreadCounts>();
  const parsed = JSON.parse(raw) as { data?: { viewer?: { login?: string }; nodes?: Array<RawNode | null> } };
  // The swept pull requests are your own, so the viewer is the author.
  const viewer = parsed.data?.viewer?.login;

  for (const node of parsed.data?.nodes ?? []) {
    const repo = node?.repository?.nameWithOwner;
    if (!repo || typeof node.number !== "number") continue;

    let unresolved = 0;
    let outdated = 0;
    let replied = 0;
    let inlineComments = 0;
    const waiting = new Map<string, number>();
    for (const thread of node.reviewThreads?.nodes ?? []) {
      if (!thread) continue;
      inlineComments += thread.comments?.totalCount ?? 0;
      if (thread.isResolved) continue;
      unresolved += 1;
      if (thread.isOutdated) outdated += 1;
      const last = thread.comments?.nodes?.[0]?.author?.login;
      if (viewer && last === viewer) replied += 1;
      else if (last) waiting.set(last, (waiting.get(last) ?? 0) + 1);
    }
    const unansweredBy = [...waiting]
      .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
      .map(([login]) => login);
    counts.set(threadKey(repo, node.number), { unresolved, outdated, replied, unansweredBy, inlineComments });
  }

  return counts;
}

/**
 * Unresolved review threads for the swept pull requests, by node id.
 *
 * One GraphQL call per hundred pull requests, not one per repository: `gh pr list
 * --json` cannot return reviewThreads at all, and an inline comment is
 * invisible to every field it can return. #5801 read "ready to merge,
 * approved" while carrying three unresolved threads.
 *
 * A failure here is not a failed sweep — the rows are still correct, they just
 * lose this one hint — so the caller treats an empty map as "unknown".
 */
export async function fetchThreadCounts(gh: GhRunner, ids: string[]): Promise<Map<string, ThreadCounts>> {
  const counts = new Map<string, ThreadCounts>();
  for (let start = 0; start < ids.length; start += THREADS_BATCH) {
    const args = ["api", "graphql", "-f", `query=${THREADS_QUERY}`];
    for (const id of ids.slice(start, start + THREADS_BATCH)) args.push("-f", `ids[]=${id}`);
    for (const [key, found] of parseThreadCounts(await gh.run(args))) counts.set(key, found);
  }
  return counts;
}

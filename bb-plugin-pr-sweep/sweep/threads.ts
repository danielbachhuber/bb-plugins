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

export const THREADS_QUERY = `
query($q: String!) {
  viewer { login }
  search(query: $q, type: ISSUE, first: 100) {
    nodes {
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
  }
}`;

export const THREADS_SEARCH = "is:pr is:open author:@me archived:false";

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
  const parsed = JSON.parse(raw) as { data?: { viewer?: { login?: string }; search?: { nodes?: RawNode[] } } };
  // The search is your own pull requests, so the viewer is the author.
  const viewer = parsed.data?.viewer?.login;

  for (const node of parsed.data?.search?.nodes ?? []) {
    const repo = node.repository?.nameWithOwner;
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
 * Unresolved review threads for every open pull request the user authored.
 *
 * One GraphQL call for the whole sweep, not one per repository: `gh pr list
 * --json` cannot return reviewThreads at all, and an inline comment is
 * invisible to every field it can return. #5801 read "ready to merge,
 * approved" while carrying three unresolved threads.
 *
 * A failure here is not a failed sweep — the rows are still correct, they just
 * lose this one hint — so the caller treats an empty map as "unknown".
 */
export async function fetchThreadCounts(gh: GhRunner): Promise<Map<string, ThreadCounts>> {
  const raw = await gh.run([
    "api", "graphql",
    "-f", `query=${THREADS_QUERY}`,
    "-f", `q=${THREADS_SEARCH}`,
  ]);
  return parseThreadCounts(raw);
}

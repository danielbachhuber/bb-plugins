// Every GitHub call this plugin makes, through `gh`. Reading a pull request's
// review threads is one GraphQL query per 100 threads, each carrying its
// first 50 comments.
import type { GhRunner } from "@danielb/gh-shared/gh";
import { toThread, type GithubReview, type GithubThread, type RawThread } from "./threads";

/** `owner/name` and number from a GitHub pull request URL. */
export function pullRequestRef(
  url: string,
): { owner: string; name: string; number: number } | null {
  const match = /github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)/.exec(url);
  if (match === null) return null;
  return { owner: match[1]!, name: match[2]!, number: Number(match[3]) };
}

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line originalLine diffSide subjectType
          comments(first: 50) {
            nodes { id url body createdAt state author { login } diffHunk }
          }
        }
      }
    }
  }
}`;

/** Stops a pull request with an enormous review from paging forever. */
const MAX_PAGES = 10;

interface ThreadsPage {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: RawThread[];
        };
      } | null;
    } | null;
  };
}

export async function fetchReview(gh: GhRunner, url: string): Promise<GithubReview | null> {
  const ref = pullRequestRef(url);
  if (ref === null) return null;
  const threads: GithubThread[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const args = [
      "api", "graphql",
      "-f", `query=${THREADS_QUERY}`,
      "-f", `owner=${ref.owner}`,
      "-f", `name=${ref.name}`,
      "-F", `number=${ref.number}`,
    ];
    if (after !== null) args.push("-f", `after=${after}`);
    const body = JSON.parse(await gh.run(args)) as ThreadsPage;
    const pull = body.data?.repository?.pullRequest;
    if (pull === null || pull === undefined) return null;
    for (const node of pull.reviewThreads.nodes) threads.push(toThread(node));
    if (!pull.reviewThreads.pageInfo.hasNextPage) break;
    after = pull.reviewThreads.pageInfo.endCursor;
  }
  return { number: ref.number, url, threads };
}

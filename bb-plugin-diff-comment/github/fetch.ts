// Every GitHub call this plugin makes, through `gh`. Reading a pull request's
// review threads is one GraphQL query per 100 threads, each carrying its
// first 50 comments. Reading its patches is one REST call per 100 files.
// Posting a draft is two GraphQL calls, or three when a review has to be
// started.
import type { GhRunner } from "@danielb/gh-shared/gh";
import type { PullFile } from "./patch";
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

/**
 * The pull request's files with their patches: one REST call per 100 files.
 * GraphQL does not return patches, which is why this is the one REST call.
 */
export async function fetchFiles(gh: GhRunner, url: string): Promise<PullFile[] | null> {
  const ref = pullRequestRef(url);
  if (ref === null) return null;
  const pages = JSON.parse(
    await gh.run([
      "api",
      `repos/${ref.owner}/${ref.name}/pulls/${ref.number}/files?per_page=100`,
      "--paginate",
      "--slurp",
    ]),
  ) as Array<Array<{ filename: string; patch?: string }>>;
  return pages.flat().map((file) => ({ path: file.filename, patch: file.patch ?? null }));
}

const PENDING_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      reviews(states: PENDING, first: 10) { nodes { id author { login } } }
    }
  }
}`;

const START_REVIEW = `mutation($pullRequestId: ID!) {
  addPullRequestReview(input: { pullRequestId: $pullRequestId }) { pullRequestReview { id } }
}`;

const ADD_THREAD = `mutation($reviewId: ID!, $path: String!, $line: Int!, $side: DiffSide!, $body: String!) {
  addPullRequestReviewThread(input: {
    pullRequestReviewId: $reviewId, path: $path, line: $line, side: $side, body: $body
  }) {
    thread { comments(first: 1) { nodes { url } } }
  }
}`;

export interface ReviewComment {
  path: string;
  side: "old" | "new";
  /** The line on the pull request's diff, from `reviewTarget`. */
  line: number;
  body: string;
}

/**
 * Add a comment to the viewer's pending review, starting one when they have
 * none. A review started without an event stays pending, so the comment is a
 * draft only the viewer sees until they submit the review on GitHub. Two
 * calls when a review is already pending, three when one has to be started.
 * Returns the new comment's URL.
 */
export async function addDraftComment(
  gh: GhRunner,
  url: string,
  comment: ReviewComment,
): Promise<string> {
  const ref = pullRequestRef(url);
  if (ref === null) throw new Error(`Not a pull request URL: ${url}`);

  const pending = JSON.parse(
    await gh.run([
      "api", "graphql",
      "-f", `query=${PENDING_QUERY}`,
      "-f", `owner=${ref.owner}`,
      "-f", `name=${ref.name}`,
      "-F", `number=${ref.number}`,
    ]),
  ) as {
    data?: {
      viewer?: { login: string };
      repository?: {
        pullRequest?: {
          id: string;
          reviews: { nodes: Array<{ id: string; author: { login: string } | null }> };
        } | null;
      } | null;
    };
  };
  const pull = pending.data?.repository?.pullRequest;
  if (pull === null || pull === undefined) throw new Error(`Pull request #${ref.number} not found`);
  const login = pending.data?.viewer?.login;

  let reviewId = pull.reviews.nodes.find((review) => review.author?.login === login)?.id;
  if (reviewId === undefined) {
    const started = JSON.parse(
      await gh.run(["api", "graphql", "-f", `query=${START_REVIEW}`, "-f", `pullRequestId=${pull.id}`]),
    ) as { data?: { addPullRequestReview?: { pullRequestReview?: { id: string } } } };
    reviewId = started.data?.addPullRequestReview?.pullRequestReview?.id;
    if (reviewId === undefined) throw new Error("GitHub did not start a review");
  }

  const added = JSON.parse(
    await gh.run([
      "api", "graphql",
      "-f", `query=${ADD_THREAD}`,
      "-f", `reviewId=${reviewId}`,
      "-f", `path=${comment.path}`,
      "-F", `line=${comment.line}`,
      "-f", `side=${comment.side === "old" ? "LEFT" : "RIGHT"}`,
      "-f", `body=${comment.body}`,
    ]),
  ) as {
    data?: { addPullRequestReviewThread?: { thread?: { comments: { nodes: Array<{ url: string }> } } | null } };
    errors?: Array<{ message: string }>;
  };
  if (added.errors !== undefined && added.errors.length > 0) {
    throw new Error(added.errors.map((error) => error.message).join("; "));
  }
  const posted = added.data?.addPullRequestReviewThread?.thread?.comments.nodes[0]?.url;
  if (posted === undefined) throw new Error("GitHub did not return the new comment");
  return posted;
}

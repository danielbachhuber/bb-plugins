// The current state of pull requests and issues, asked of GitHub in one
// GraphQL query. Building the query and reading its answer are pure; gh.ts
// runs it.
import type { GitHubRef } from "./notifications.js";

export type GitHubStateName = "open" | "draft" | "merged" | "closed";
export type ReviewDecision = "approved" | "changes_requested" | "review_required";

export interface GitHubState {
  state: GitHubStateName;
  /** Pull requests only, and only when the repository requires reviews. */
  review: ReviewDecision | null;
  /** Closed issues only. */
  closedAs?: "completed" | "not_planned" | null;
  /**
   * Whose review is still pending on an open pull request: logins and
   * `org/team` slugs. GitHub drops a team once one of its members reviews.
   * Undefined when it was not asked.
   */
  pendingReviewers?: string[];
}

/** GitHub logins and repository names: letters, digits, `-`, `_`, `.`. */
const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * One aliased `issueOrPullRequest` lookup per reference, so a whole inbox is
 * one request. References whose owner or name could not be a GitHub name are
 * left out rather than spliced into the query.
 */
export function buildStateQuery(refs: readonly GitHubRef[]): { query: string; aliases: Map<string, GitHubRef> } {
  const aliases = new Map<string, GitHubRef>();
  const fields: string[] = [];

  refs.forEach((ref, index) => {
    const [owner, name] = ref.repo.split("/");
    if (owner === undefined || name === undefined || !NAME.test(owner) || !NAME.test(name)) return;
    if (!Number.isInteger(ref.number) || ref.number < 1) return;
    const alias = `r${index}`;
    aliases.set(alias, ref);
    fields.push(
      `${alias}: repository(owner: "${owner}", name: "${name}") { issueOrPullRequest(number: ${ref.number}) { ` +
        `__typename ... on PullRequest { state isDraft reviewDecision ` +
        `reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on Team { combinedSlug } ... on User { login } } } } } ` +
        `... on Issue { state stateReason } } }`,
    );
  });

  return { query: fields.length === 0 ? "" : `query { ${fields.join(" ")} }`, aliases };
}

function review(value: unknown): ReviewDecision | null {
  if (value === "APPROVED") return "approved";
  if (value === "CHANGES_REQUESTED") return "changes_requested";
  if (value === "REVIEW_REQUIRED") return "review_required";
  return null;
}

/**
 * The answer, keyed by `repo#number`. A repository you cannot see comes back
 * null with an error beside it; that reference is simply missing here.
 */
export function parseStateResponse(body: unknown, aliases: ReadonlyMap<string, GitHubRef>): Map<string, GitHubState> {
  const states = new Map<string, GitHubState>();
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  if (data === undefined || data === null) return states;

  for (const [alias, ref] of aliases) {
    const node = (data[alias] as { issueOrPullRequest?: Record<string, unknown> } | null)?.issueOrPullRequest;
    if (node === undefined || node === null) continue;

    let state: GitHubStateName;
    if (node.state === "MERGED") state = "merged";
    else if (node.state === "CLOSED") state = "closed";
    else if (node.isDraft === true) state = "draft";
    else state = "open";

    const pull = node.__typename === "PullRequest";
    const requests = (node.reviewRequests as { nodes?: unknown } | undefined)?.nodes;
    const pendingReviewers = Array.isArray(requests)
      ? requests.flatMap((request) => {
          const reviewer = (request as { requestedReviewer?: { combinedSlug?: unknown; login?: unknown } } | null)?.requestedReviewer;
          const name = reviewer?.combinedSlug ?? reviewer?.login;
          return typeof name === "string" ? [name] : [];
        })
      : undefined;
    states.set(`${ref.repo}#${ref.number}`, {
      ...(pull && pendingReviewers !== undefined ? { pendingReviewers } : {}),
      state,
      review: pull && state !== "merged" && state !== "closed" ? review(node.reviewDecision) : null,
      closedAs:
        !pull && state === "closed" ? (node.stateReason === "NOT_PLANNED" ? "not_planned" : "completed") : null,
    });
  }
  return states;
}

/**
 * What the email header said when it was sent, for when gh cannot be asked.
 * `X-GitHub-PullRequestStatus` is `open`, `merged`, or `closed`.
 */
export function stateFromHeader(value: string | null): GitHubState | null {
  if (value === "merged" || value === "closed" || value === "open") return { state: value, review: null };
  return null;
}

// The current state of pull requests and issues, asked of GitHub in one
// GraphQL query. Building the query and reading its answer are pure; gh.ts
// runs it.
import type { GitHubRef } from "./notifications.js";

export type GitHubStateName = "open" | "draft" | "merged" | "closed";
export type ReviewDecision = "approved" | "changes_requested" | "review_required";
export type CheckState = "passing" | "failing" | "pending";
export type MergeMethod = "merge" | "squash" | "rebase";
/**
 * Where your own review of a pull request stands, as GitHub Context's banner
 * says it: asked for and not yet given, asked for again after you gave one,
 * or the review you gave.
 */
export type MyReview = "requested" | "re-requested" | "approved" | "changes_requested" | "commented" | "dismissed";

export type ReviewerState = "approved" | "changes_requested" | "commented" | "dismissed" | "pending";

/** Someone asked for a review of a pull request, or who gave one. */
export interface Reviewer {
  /** A user's login, or a team's `org/team` slug. */
  login: string;
  team: boolean;
  state: ReviewerState;
  avatarUrl: string;
}

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
  /**
   * Everyone reviewing a pull request and where each stands, as GitHub
   * Context's banner shows them. Undefined when it was not asked.
   */
  reviewers?: Reviewer[];
  /** The latest commit's checks, on an open pull request that has any. */
  checks?: CheckState | null;
  /**
   * The methods you can merge an open pull request with right now, as the
   * repository allows them. Empty when it cannot be merged: it is a draft,
   * conflicts, is blocked by a required review or check, GitHub has not
   * worked it out yet, you cannot write to the repository, or it is not
   * yours: a pull request you only watch or review is its author's to merge.
   */
  mergeMethods?: MergeMethod[];
  /** Your review of an open pull request; null when you are not a reviewer. */
  myReview?: MyReview | null;
  /**
   * Whom the request still waiting on you named: you, or a team you are on.
   * GitHub resolves the team membership. Null when nothing waits on you.
   */
  requestedVia?: "you" | "team" | null;
}

const REVIEW_FIELDS = "state submittedAt author { login avatarUrl }";

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
      `${alias}: repository(owner: "${owner}", name: "${name}") { ` +
        `viewerPermission mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed ` +
        `issueOrPullRequest(number: ${ref.number}) { ` +
        `__typename ... on PullRequest { state isDraft reviewDecision mergeStateStatus viewerDidAuthor author { login } ` +
        `viewerLatestReview { state } viewerLatestReviewRequest { requestedReviewer { __typename } } ` +
        `commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } ` +
        `latestReviews(first: 20) { nodes { ${REVIEW_FIELDS} } } latestOpinionatedReviews(first: 20) { nodes { ${REVIEW_FIELDS} } } ` +
        `reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on Team { combinedSlug avatarUrl } ... on User { login avatarUrl } } } } } ` +
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

function checks(node: Record<string, unknown>): CheckState | null {
  const commits = (node.commits as { nodes?: Array<{ commit?: { statusCheckRollup?: { state?: unknown } | null } }> } | undefined)?.nodes;
  const state = commits?.[commits.length - 1]?.commit?.statusCheckRollup?.state;
  if (state === "SUCCESS") return "passing";
  if (state === "FAILURE" || state === "ERROR") return "failing";
  if (state === "PENDING" || state === "EXPECTED") return "pending";
  return null;
}

const VERDICTS: Record<string, MyReview> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "commented",
  DISMISSED: "dismissed",
};

/**
 * Your review, from the latest one you submitted (a PENDING draft does not
 * count) and the request still waiting on you. GitHub removes a request, a
 * team's included, once you review, and adds one back on a re-request.
 *
 * The author is never a reviewer: GitHub records their replies to review
 * comments as COMMENTED reviews.
 */
function myReview(node: Record<string, unknown>): { myReview: MyReview | null; requestedVia: "you" | "team" | null } {
  if (node.viewerDidAuthor === true) return { myReview: null, requestedVia: null };
  const request = node.viewerLatestReviewRequest as { requestedReviewer?: { __typename?: unknown } | null } | null | undefined;
  const requestedVia = request == null ? null : request.requestedReviewer?.__typename === "Team" ? "team" : "you";
  const verdict = VERDICTS[String((node.viewerLatestReview as { state?: unknown } | null | undefined)?.state)];
  if (verdict !== undefined) return { myReview: requestedVia === null ? verdict : "re-requested", requestedVia };
  return { myReview: requestedVia === null ? null : "requested", requestedVia };
}

interface ReviewNode {
  state?: unknown;
  submittedAt?: unknown;
  author?: { login?: unknown; avatarUrl?: unknown } | null;
}

function reviewNodes(value: unknown): ReviewNode[] {
  const nodes = (value as { nodes?: unknown } | undefined)?.nodes;
  return Array.isArray(nodes) ? nodes.filter((node): node is ReviewNode => node !== null && typeof node === "object") : [];
}

const REVIEWER_VERDICTS: Record<string, ReviewerState> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "commented",
  DISMISSED: "dismissed",
};

/**
 * Who is reviewing a pull request and where each stands, in the order they
 * reviewed, then everyone still waiting to be asked.
 *
 * An approval or request for changes stands through later comments, as on
 * GitHub, so `latestOpinionatedReviews` wins over `latestReviews`. A reviewer
 * asked again is pending. Requests left on a merged or closed pull request are
 * not waiting on anyone. The author is left out: GitHub records their replies
 * to review comments as COMMENTED reviews.
 */
function reviewers(node: Record<string, unknown>, open: boolean): Reviewer[] {
  const author = String((node.author as { login?: unknown } | null | undefined)?.login ?? "").toLowerCase();
  const chosen = new Map<string, { reviewer: Reviewer; at: string }>();
  for (const review of [...reviewNodes(node.latestReviews), ...reviewNodes(node.latestOpinionatedReviews)]) {
    const login = review.author?.login;
    const state = REVIEWER_VERDICTS[String(review.state)];
    if (typeof login !== "string" || state === undefined || login.toLowerCase() === author) continue;
    const avatarUrl = typeof review.author?.avatarUrl === "string" ? review.author.avatarUrl : "";
    chosen.set(login.toLowerCase(), { reviewer: { login, team: false, state, avatarUrl }, at: String(review.submittedAt ?? "") });
  }
  const list = [...chosen.values()].sort((a, b) => a.at.localeCompare(b.at)).map((entry) => entry.reviewer);
  if (!open) return list;

  const requests = (node.reviewRequests as { nodes?: unknown } | undefined)?.nodes;
  for (const request of Array.isArray(requests) ? requests : []) {
    const reviewer = (request as { requestedReviewer?: { combinedSlug?: unknown; login?: unknown; avatarUrl?: unknown } | null } | null)
      ?.requestedReviewer;
    const team = typeof reviewer?.combinedSlug === "string";
    const login = reviewer?.combinedSlug ?? reviewer?.login;
    if (typeof login !== "string") continue;
    const known = list.find((entry) => entry.login.toLowerCase() === login.toLowerCase());
    if (known !== undefined) known.state = "pending";
    else list.push({ login, team, state: "pending", avatarUrl: typeof reviewer?.avatarUrl === "string" ? reviewer.avatarUrl : "" });
  }
  return list;
}

/**
 * GitHub's own merge box allows a merge in these states. UNSTABLE is a
 * failing check that is not required; HAS_HOOKS is a clean one on GitHub
 * Enterprise. BLOCKED, BEHIND (when the branch must be up to date), DIRTY,
 * DRAFT, and UNKNOWN (not worked out yet) do not.
 */
const MERGEABLE = new Set(["CLEAN", "HAS_HOOKS", "UNSTABLE"]);
const CAN_WRITE = new Set(["ADMIN", "MAINTAIN", "WRITE"]);

function mergeMethods(repository: Record<string, unknown>, node: Record<string, unknown>): MergeMethod[] {
  if (node.state !== "OPEN" || node.isDraft === true || node.viewerDidAuthor !== true) return [];
  if (!MERGEABLE.has(String(node.mergeStateStatus)) || !CAN_WRITE.has(String(repository.viewerPermission))) return [];
  const methods: MergeMethod[] = [];
  if (repository.mergeCommitAllowed === true) methods.push("merge");
  if (repository.squashMergeAllowed === true) methods.push("squash");
  if (repository.rebaseMergeAllowed === true) methods.push("rebase");
  return methods;
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
    const repository = (data[alias] as Record<string, unknown> | null) ?? {};
    const node = (repository as { issueOrPullRequest?: Record<string, unknown> | null }).issueOrPullRequest;
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
      ...(pull && pendingReviewers !== undefined
        ? { pendingReviewers, reviewers: reviewers(node, state === "open" || state === "draft") }
        : {}),
      ...(pull && (state === "open" || state === "draft")
        ? { checks: checks(node), mergeMethods: mergeMethods(repository, node), ...myReview(node) }
        : {}),
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

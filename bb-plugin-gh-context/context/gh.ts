import type { GhRunner } from "@danielb/gh-shared/gh";
import { summarizeChecks, type Checks, type RollupEntry } from "./checks.js";
import type { MyReview } from "./contract.js";
import type { IssueRef } from "./rules.js";

/**
 * The only module that runs `gh`.
 *
 * The banner asks for the same issue and pull request every time it renders
 * and every time something in the thread changes, so answers are cached. A
 * failure is cached too, for less time: an unauthenticated or missing `gh`
 * would otherwise be asked again on every render, and the banner is useful
 * without titles.
 */

export interface GhIssue {
  title: string;
  state: "open" | "closed";
  /** Assignee logins, lowercased. */
  assignees: string[];
}

export interface GhPullRequest {
  title: string;
  url: string;
  body: string;
  state: "open" | "draft" | "closed" | "merged";
  closing: IssueRef[];
  /** The author's login, lowercased; null when GitHub does not say. */
  author: string | null;
  /** Each reviewer's standing review, by lowercased login. */
  latestReviews: Record<string, ReviewVerdict>;
  /** Logins, lowercased, of users whose review request is still outstanding. */
  requestedReviewers: string[];
  checks: Checks;
}

export type ReviewVerdict = "approved" | "changes_requested" | "commented" | "dismissed";

export interface Gh {
  issue(ref: IssueRef): Promise<GhIssue | null>;
  /** The login `gh` is signed in as, lowercased; null when it cannot say. */
  viewer(): Promise<string | null>;
  pullRequest(ref: IssueRef): Promise<GhPullRequest | null>;
  /**
   * `repo#number` keys, lowercased, of open pull requests waiting on the
   * viewer's review, directly or through a team; null when `gh` cannot say.
   */
  reviewRequested(): Promise<string[] | null>;
}

const ANSWER_TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 60_000;

interface IssueJson {
  title?: unknown;
  state?: unknown;
  assignees?: Array<{ login?: unknown }>;
}

interface PullRequestJson {
  title?: unknown;
  url?: unknown;
  body?: unknown;
  state?: unknown;
  isDraft?: unknown;
  author?: { login?: unknown } | null;
  closingIssuesReferences?: Array<{
    number?: unknown;
    repository?: { name?: unknown; owner?: { login?: unknown } };
  }>;
  reviews?: Array<{ author?: { login?: unknown } | null; state?: unknown; submittedAt?: unknown }>;
  reviewRequests?: Array<{ login?: unknown }>;
  statusCheckRollup?: RollupEntry[] | null;
}

/** A review that was actually submitted. PENDING reviews are drafts. */
const VERDICTS: Record<string, ReviewVerdict> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "commented",
  DISMISSED: "dismissed",
};

/**
 * Each reviewer's newest review, except that a comment does not replace an
 * approval or a request for changes, as on GitHub: commenting after approving
 * leaves the pull request approved.
 */
function latestReviews(reviews: NonNullable<PullRequestJson["reviews"]>): Record<string, ReviewVerdict> {
  const latest: Record<string, ReviewVerdict> = {};
  const ordered = [...reviews].sort((a, b) =>
    String(a.submittedAt ?? "").localeCompare(String(b.submittedAt ?? "")),
  );
  for (const review of ordered) {
    const login = review.author?.login;
    const verdict = VERDICTS[String(review.state ?? "").toUpperCase()];
    if (typeof login !== "string" || !verdict) continue;
    const key = login.toLowerCase();
    if (verdict === "commented" && latest[key] && latest[key] !== "commented") continue;
    latest[key] = verdict;
  }
  return latest;
}

function logins(values: Array<unknown>): string[] {
  return [
    ...new Set(
      values.filter((login): login is string => typeof login === "string").map((login) => login.toLowerCase()),
    ),
  ];
}

/**
 * Where the viewer's review of a pull request stands, or null when they are
 * not a reviewer.
 *
 * GitHub drops a reviewer from `reviewRequests` when they submit a review and
 * adds them back on a re-request, so a login with a review that is also in
 * that list owes another look. A request to a team names the team and not the
 * viewer, so `requestedOfMe` (from a search, which does see team requests)
 * counts only before their first review: after it, their review is the answer.
 * Requests left on a merged or closed pull request are not waiting on anyone.
 *
 * The author is never a reviewer: GitHub records their replies to review
 * comments as COMMENTED reviews.
 */
export function myReview(pr: GhPullRequest, viewer: string | null, requestedOfMe: boolean): MyReview | null {
  if (viewer === null || pr.author === viewer) return null;
  const open = pr.state === "open" || pr.state === "draft";
  const direct = open && pr.requestedReviewers.includes(viewer);
  const verdict = pr.latestReviews[viewer];
  if (verdict) return direct ? "re-requested" : verdict;
  return direct || (open && requestedOfMe) ? "requested" : null;
}

function parseIssue(json: IssueJson): GhIssue | null {
  if (typeof json.title !== "string" || typeof json.state !== "string") return null;
  const assignees = (json.assignees ?? [])
    .map((assignee) => assignee.login)
    .filter((login): login is string => typeof login === "string")
    .map((login) => login.toLowerCase());
  return {
    title: json.title,
    state: json.state.toUpperCase() === "OPEN" ? "open" : "closed",
    assignees,
  };
}

function parsePullRequest(json: PullRequestJson): GhPullRequest | null {
  if (typeof json.title !== "string" || typeof json.url !== "string") return null;
  const state = typeof json.state === "string" ? json.state.toUpperCase() : "";
  const closing: IssueRef[] = [];
  for (const ref of json.closingIssuesReferences ?? []) {
    const owner = ref.repository?.owner?.login;
    const name = ref.repository?.name;
    if (typeof ref.number !== "number" || typeof owner !== "string" || typeof name !== "string") {
      continue;
    }
    closing.push({ repo: `${owner}/${name}`.toLowerCase(), number: ref.number });
  }
  return {
    title: json.title,
    url: json.url,
    body: typeof json.body === "string" ? json.body : "",
    state:
      state === "MERGED"
        ? "merged"
        : state === "CLOSED"
          ? "closed"
          : json.isDraft === true
            ? "draft"
            : "open",
    closing,
    author: typeof json.author?.login === "string" ? json.author.login.toLowerCase() : null,
    latestReviews: latestReviews(json.reviews ?? []),
    requestedReviewers: logins((json.reviewRequests ?? []).map((request) => request.login)),
    checks: summarizeChecks(json.statusCheckRollup),
  };
}

export function createGh(runner: GhRunner, now: () => number = Date.now): Gh {
  const cache = new Map<string, { value: unknown; expiresAt: number }>();

  async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.value as T | null;
    let value: T | null = null;
    try {
      value = await load();
    } catch {
      value = null;
    }
    cache.set(key, { value, expiresAt: now() + (value === null ? FAILURE_TTL_MS : ANSWER_TTL_MS) });
    return value;
  }

  return {
    issue(ref) {
      return cached(`issue:${ref.repo}#${ref.number}`, async () =>
        parseIssue(
          JSON.parse(
            await runner.run([
              "issue",
              "view",
              String(ref.number),
              "--repo",
              ref.repo,
              "--json",
              "title,state,assignees",
            ]),
          ) as IssueJson,
        ),
      );
    },
    viewer() {
      return cached("viewer", async () => {
        const login = (await runner.run(["api", "user", "--jq", ".login"])).trim();
        return login === "" ? null : login.toLowerCase();
      });
    },
    pullRequest(ref) {
      return cached(`pull:${ref.repo}#${ref.number}`, async () =>
        parsePullRequest(
          JSON.parse(
            await runner.run([
              "pr",
              "view",
              String(ref.number),
              "--repo",
              ref.repo,
              "--json",
              "title,url,body,state,isDraft,author,closingIssuesReferences,reviews,reviewRequests,statusCheckRollup",
            ]),
          ) as PullRequestJson,
        ),
      );
    },
    reviewRequested() {
      return cached("review-requested", async () => {
        const found = JSON.parse(
          await runner.run([
            "search",
            "prs",
            "--review-requested=@me",
            "--state=open",
            "--limit",
            "100",
            "--json",
            "number,repository",
          ]),
        ) as Array<{ number?: unknown; repository?: { nameWithOwner?: unknown } }>;
        return found
          .filter((pr) => typeof pr.number === "number" && typeof pr.repository?.nameWithOwner === "string")
          .map((pr) => `${String(pr.repository!.nameWithOwner).toLowerCase()}#${String(pr.number)}`);
      });
    },
  };
}

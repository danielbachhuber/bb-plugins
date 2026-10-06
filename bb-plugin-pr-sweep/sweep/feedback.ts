import type { GhRunner } from "@danielb/gh-shared/gh";
import { isBotLogin } from "./classify.js";

/**
 * What reviewers left on one pull request, for the drawer under its row: the
 * reviews with something to say, every inline thread, and the general
 * comments. Your own comments and bots' are left out, since neither is
 * feedback for you.
 */

export type FeedbackEntry =
  | {
      kind: "review";
      author: string;
      avatarUrl: string;
      state: "changes_requested" | "approved" | "commented";
      body: string;
      url: string;
      at: number;
    }
  | {
      kind: "thread";
      author: string;
      avatarUrl: string;
      path: string;
      /** The line on the current diff, or where it was before the code changed. */
      line: number | null;
      /** "unanswered" when someone else spoke last, "replied" when you did. */
      status: "unanswered" | "replied" | "resolved";
      outdated: boolean;
      /** Comments after the first. */
      replies: number;
      body: string;
      url: string;
      at: number;
    }
  | {
      kind: "comment";
      author: string;
      avatarUrl: string;
      body: string;
      url: string;
      at: number;
    };

export const FEEDBACK_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviews(last: 50) {
        nodes { author { __typename login avatarUrl } state bodyText url submittedAt }
      }
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          originalLine
          first: comments(first: 1) { nodes { author { __typename login avatarUrl } bodyText url createdAt } }
          last: comments(last: 1) { totalCount nodes { author { login } } }
        }
      }
      comments(last: 50) {
        nodes { author { __typename login avatarUrl } bodyText url createdAt }
      }
    }
  }
}`;

interface RawAuthor {
  __typename?: string;
  login?: string;
  avatarUrl?: string;
}

interface RawComment {
  author?: RawAuthor | null;
  bodyText?: string;
  url?: string;
  createdAt?: string;
}

interface RawPull {
  reviews?: { nodes?: Array<(RawComment & { state?: string; submittedAt?: string }) | null> | null };
  reviewThreads?: {
    nodes?: Array<{
      isResolved?: boolean;
      isOutdated?: boolean;
      path?: string;
      line?: number | null;
      originalLine?: number | null;
      first?: { nodes?: Array<RawComment | null> | null };
      last?: { totalCount?: number; nodes?: Array<{ author?: { login?: string } | null } | null> | null };
    } | null> | null;
  };
  comments?: { nodes?: Array<RawComment | null> | null };
}

const REVIEW_STATE: Record<string, "changes_requested" | "approved" | "commented"> = {
  CHANGES_REQUESTED: "changes_requested",
  APPROVED: "approved",
  COMMENTED: "commented",
};

/** Someone other than you and not a bot, with a login to show. */
function person(author: RawAuthor | null | undefined, viewer: string | undefined): { login: string; avatarUrl: string } | null {
  const login = author?.login;
  if (!login || login === viewer) return null;
  if (author?.__typename === "Bot" || isBotLogin(login)) return null;
  return { login, avatarUrl: author?.avatarUrl ?? "" };
}

function time(iso: string | undefined): number {
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

const THREAD_ORDER = { unanswered: 0, replied: 1, resolved: 2 } as const;

/**
 * The feedback in reading order: reviews that requested changes, then the
 * other reviews with a body, then unanswered threads, threads you replied to,
 * and general comments, then resolved threads last. Oldest first within each.
 */
export function parseFeedback(raw: string): FeedbackEntry[] {
  const parsed = JSON.parse(raw) as {
    data?: { viewer?: { login?: string }; repository?: { pullRequest?: RawPull | null } | null };
  };
  const viewer = parsed.data?.viewer?.login;
  const pr = parsed.data?.repository?.pullRequest;
  if (!pr) return [];

  const reviews: Array<Extract<FeedbackEntry, { kind: "review" }>> = [];
  for (const review of pr.reviews?.nodes ?? []) {
    const who = review && person(review.author, viewer);
    const state = review?.state ? REVIEW_STATE[review.state] : undefined;
    if (!who || !state) continue;
    const body = review!.bodyText?.trim() ?? "";
    // An approval or a comment with no words says nothing the reviewer avatars do not.
    if (!body && state !== "changes_requested") continue;
    reviews.push({
      kind: "review",
      author: who.login,
      avatarUrl: who.avatarUrl,
      state,
      body,
      url: review!.url ?? "",
      at: time(review!.submittedAt),
    });
  }
  reviews.sort((a, b) => Number(b.state === "changes_requested") - Number(a.state === "changes_requested") || a.at - b.at);

  const threads: Array<Extract<FeedbackEntry, { kind: "thread" }>> = [];
  for (const thread of pr.reviewThreads?.nodes ?? []) {
    const first = thread?.first?.nodes?.[0];
    if (!thread || !first) continue;
    const who = person(first.author, viewer);
    if (!who) continue;
    const last = thread.last?.nodes?.[0]?.author?.login;
    const status = thread.isResolved ? "resolved" : viewer && last === viewer ? "replied" : "unanswered";
    threads.push({
      kind: "thread",
      author: who.login,
      avatarUrl: who.avatarUrl,
      path: thread.path ?? "",
      line: thread.line ?? thread.originalLine ?? null,
      status,
      outdated: thread.isOutdated === true,
      replies: Math.max(0, (thread.last?.totalCount ?? 1) - 1),
      body: first.bodyText?.trim() ?? "",
      url: first.url ?? "",
      at: time(first.createdAt),
    });
  }
  threads.sort((a, b) => THREAD_ORDER[a.status] - THREAD_ORDER[b.status] || a.at - b.at);

  const comments: Array<Extract<FeedbackEntry, { kind: "comment" }>> = [];
  for (const comment of pr.comments?.nodes ?? []) {
    const who = comment && person(comment.author, viewer);
    const body = comment?.bodyText?.trim();
    if (!who || !body) continue;
    comments.push({ kind: "comment", author: who.login, avatarUrl: who.avatarUrl, body, url: comment!.url ?? "", at: time(comment!.createdAt) });
  }
  comments.sort((a, b) => a.at - b.at);

  const open = threads.filter((thread) => thread.status !== "resolved");
  const resolved = threads.filter((thread) => thread.status === "resolved");
  return [...reviews, ...open, ...comments, ...resolved];
}

/**
 * One pull request's feedback, in one GraphQL call. Runs when its drawer
 * opens, never during a sweep.
 */
export async function fetchFeedback(gh: GhRunner, repo: string, number: number): Promise<FeedbackEntry[]> {
  const [owner, name] = repo.split("/");
  const raw = await gh.run([
    "api", "graphql",
    "-f", `query=${FEEDBACK_QUERY}`,
    "-f", `owner=${owner}`,
    "-f", `name=${name}`,
    "-F", `number=${number}`,
  ]);
  return parseFeedback(raw);
}

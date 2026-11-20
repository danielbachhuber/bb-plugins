// One person's review work: what is waiting on them, and how their own pull
// requests fared in review. Pure: reads stored GitHub objects, makes no calls.
import type { PullRequestWithActivity, TimelineItem } from "../mirror/github.js";

import { businessDaysBetween } from "./business-time.js";
import { countedReviews, reviewRounds } from "./reviews.js";
import { isWho, loginsOf, type Who } from "./who.js";

export interface AwaitingReviewRow {
  number: number;
  title: string;
  url: string;
  author: string | null;
  /** Who it is assigned to now, which is nobody for most rows. */
  assignees: string[];
  /** Who of them it is waiting on, which on a person's page is them. */
  reviewers: string[];
  /** When the earliest outstanding request was made. */
  requestedAt: string;
  waitingDays: number;
}

export interface AuthoredPullRequestRow {
  number: number;
  title: string;
  url: string;
  author: string | null;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  createdAt: string;
  mergedAt: string | null;
  /** Lines added and removed; null when the mirror has not stored them. */
  size: number | null;
  /** Business days from ready for review to the first review; null with no review yet. */
  firstReviewDays: number | null;
  /** Reviews after the first, each reviewer counted once a day. */
  followUps: number;
  /** Business days from ready for review to merge; null while it is not merged. */
  mergeDays: number | null;
  /** Business days it has been open and ready, for an open pull request; null otherwise. */
  waitingDays: number | null;
}

type RequestEvent = Extract<TimelineItem, { __typename: "ReviewRequestedEvent" | "ReviewRequestRemovedEvent" }>;

const requestedLogin = (event: RequestEvent): string | null => {
  const reviewer = event.requestedReviewer;
  return reviewer !== null && "login" in reviewer ? reviewer.login : null;
};

/**
 * When the pull request became ready for review: it left draft, or it opened
 * if it never was one. Null while it is a draft, since nothing is waiting yet.
 */
export function readyAt(pr: PullRequestWithActivity): string | null {
  if (pr.isDraft) return null;
  const left = pr.timelineItems.find((item) => item.__typename === "ReadyForReviewEvent");
  return left?.createdAt ?? pr.createdAt;
}

/**
 * Open pull requests waiting on a review from `who`: the latest request
 * naming them has not been withdrawn, and they have not reviewed since it.
 * For a team, a pull request waits on it while it waits on any member.
 * Longest wait first.
 *
 * Only requests that name the person. A request made of a team is waiting on
 * the team, and there is no one to attribute it to until someone reviews.
 */
export function awaitingReview(
  prs: readonly PullRequestWithActivity[],
  who: Who,
  now: number,
): AwaitingReviewRow[] {
  const rows: AwaitingReviewRow[] = [];
  for (const pr of prs) {
    if (pr.state !== "OPEN" || pr.isDraft) continue;
    const latest = new Map<string, RequestEvent>();
    for (const item of pr.timelineItems) {
      if (item.__typename !== "ReviewRequestedEvent" && item.__typename !== "ReviewRequestRemovedEvent") continue;
      const login = requestedLogin(item);
      if (isWho(who, login)) latest.set(login, item);
    }
    const reviews = countedReviews(pr);
    const outstanding = [...latest].filter(
      ([login, event]) =>
        event.__typename === "ReviewRequestedEvent" &&
        !reviews.some((review) => review.author?.login === login && review.submittedAt! > event.createdAt),
    );
    if (outstanding.length === 0) continue;
    const requestedAt = outstanding.map(([, event]) => event.createdAt).sort()[0];
    rows.push({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author?.login ?? null,
      assignees: (pr.assignees ?? [])
        .map((who) => who.login)
        .filter((who): who is string => who !== undefined),
      reviewers: loginsOf(new Set(outstanding.map(([login]) => login))),
      requestedAt,
      waitingDays: businessDaysBetween(Date.parse(requestedAt), now),
    });
  }
  return rows.sort((a, b) => b.waitingDays - a.waitingDays);
}

/**
 * Pull requests `who` opened that were active in the period, newest first,
 * each with how its review went. For a team, any member's.
 */
export function authoredPullRequests(
  prs: readonly PullRequestWithActivity[],
  who: Who,
  since: number,
  now: number,
): AuthoredPullRequestRow[] {
  const rows: AuthoredPullRequestRow[] = [];
  for (const pr of prs) {
    if (!isWho(who, pr.author?.login)) continue;
    if (Date.parse(pr.updatedAt) < since) continue;
    const ready = readyAt(pr);
    const readyMs = ready === null ? null : Date.parse(ready);
    const rounds = reviewRounds(countedReviews(pr));
    const first = rounds[0]?.submittedAt ?? null;
    rows.push({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author?.login ?? null,
      state: pr.state,
      isDraft: pr.isDraft,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt,
      size: pr.additions === undefined ? null : pr.additions + (pr.deletions ?? 0),
      firstReviewDays: readyMs === null || first === null ? null : businessDaysBetween(readyMs, Date.parse(first)),
      followUps: Math.max(0, rounds.length - 1),
      mergeDays:
        readyMs === null || pr.mergedAt === null ? null : businessDaysBetween(readyMs, Date.parse(pr.mergedAt)),
      waitingDays: pr.state === "OPEN" && readyMs !== null ? businessDaysBetween(readyMs, now) : null,
    });
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

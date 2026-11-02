// Everything one person did in a period, as `bb contributor-dashboard
// activity` prints it: the pull requests they opened and how each fared, the
// reviews they gave and were asked for, and the issues they opened and held.
// Pure: reads stored GitHub objects, makes no calls.
import { isBot, type IssueWithActivity, type PullRequestReview, type PullRequestWithActivity } from "../mirror/github.js";

import { plannedAt } from "./assigned-issues.js";
import { everyone } from "./everyone.js";
import { isRequestEvent, teamRequestWinner } from "./people.js";
import { awaitingReview, type AwaitingReviewRow } from "./person.js";
import { countedReviews, localDay } from "./reviews.js";
import { awaitingTeamReview, type TeamAwaitingRow, type TeamMembers } from "./teams.js";

export interface ReportPeriod {
  /** The first day, as asked for. */
  from: string;
  /** The last day, as asked for, included. */
  to: string;
  /** Local midnight at the start of `from`. */
  start: string;
  /** Local midnight after `to`: the period ends just before it. */
  end: string;
}

export interface ReceivedReview {
  reviewer: string;
  state: PullRequestReview["state"];
  submittedAt: string;
  inPeriod: boolean;
}

export interface ReportPullRequest {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  /** Null for a row mirrored before the sync asked for it. */
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  body: string | null;
  /** The issues it closes, or closed when it merged. */
  closesIssues: number[];
  /** Which of its events fell in the period. */
  inPeriod: { opened: boolean; merged: boolean; closedUnmerged: boolean; reviewed: boolean };
  /** Every review others gave it, oldest first, not only the period's. */
  reviews: ReceivedReview[];
}

export interface GivenReview {
  pullRequest: { number: number; title: string; url: string; author: string | null };
  state: PullRequestReview["state"];
  submittedAt: string;
  /**
   * Whether the dashboard counts this review: the first of theirs on this
   * pull request that day. The rest of a burst of replies are false.
   */
  counted: boolean;
}

export interface ReviewRequestRow {
  pullRequest: { number: number; title: string; url: string; author: string | null };
  requestedAt: string;
  requestedBy: string | null;
  /** The team the request named, when they picked it up for the team; null when it named them. */
  via: string | null;
  /** Their first review after the request, if any, whenever it came. */
  reviewedAt: string | null;
}

export interface ReportIssue {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  author: string | null;
  createdAt: string;
  closedAt: string | null;
  /** When it first reached a milestone or project; null when it never did. */
  plannedAt: string | null;
  /** When it was last assigned to them before the period ended; null when the mirror has no event for it. */
  assignedAt: string | null;
  assignedNow: boolean;
}

export interface ActivityReport {
  repository: string;
  login: string;
  /** False when the login appears nowhere in the mirror, which usually means a typo. */
  known: boolean;
  period: ReportPeriod;
  mirror: { syncedAt: string | null; stale: boolean; backfillDone: boolean };
  /** The counts the person page shows for the same days. */
  summary: {
    pullRequestsOpened: number;
    pullRequestsMerged: number;
    pullRequestsClosedUnmerged: number;
    reviewsGiven: number;
    reviewsGivenAll: number;
    pullRequestsReviewed: number;
    reviewRequests: number;
    reviewsReceived: number;
    awaitingReview: number;
    issuesOpened: number;
    issuesAssigned: number;
    assignedIssuesClosed: number;
  };
  pullRequests: ReportPullRequest[];
  reviewsGiven: GivenReview[];
  reviewRequests: ReviewRequestRow[];
  /** Waiting on their review now, whatever the period. */
  awaitingReview: AwaitingReviewRow[];
  /** Waiting now on a team of theirs that nobody has started. */
  awaitingTeamReview: TeamAwaitingRow[];
  issues: {
    opened: ReportIssue[];
    /** Assigned to them at some point in the period while open. */
    assigned: ReportIssue[];
    /** Assigned to them now and closed in the period, as the person page counts them. */
    closedWhileAssigned: ReportIssue[];
  };
}

export interface ActivityReportInput {
  repository: string;
  login: string;
  period: { from: string; to: string; start: number; end: number };
  pullRequests: readonly PullRequestWithActivity[];
  issues: readonly IssueWithActivity[];
  teams: TeamMembers;
  sync: { syncedAt: number | null; backfillDone: boolean; staleAfterMs: number };
  now: number;
}

/**
 * The span of each spell the issue was assigned to `login`, from its assign
 * and unassign events. An issue assigned before the mirror kept events, with
 * no events naming them, counts as theirs since it opened.
 */
function heldSpans(issue: IssueWithActivity, login: string): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = [];
  let since: number | null = null;
  for (const item of issue.timelineItems) {
    if (item.__typename !== "AssignedEvent" && item.__typename !== "UnassignedEvent") continue;
    if (item.assignee?.login !== login) continue;
    const at = Date.parse(item.createdAt);
    if (item.__typename === "AssignedEvent") since ??= at;
    else if (since !== null) {
      spans.push({ from: since, to: at });
      since = null;
    }
  }
  const assignedNow = issue.assignees.some((who) => who.login === login);
  if (since !== null) spans.push({ from: since, to: Infinity });
  else if (spans.length === 0 && assignedNow) spans.push({ from: Date.parse(issue.createdAt), to: Infinity });
  return spans;
}

export function activityReport(input: ActivityReportInput): ActivityReport {
  const { login, pullRequests: prs, issues, now } = input;
  const { start, end } = input.period;
  const within = (at: string | null) => at !== null && Date.parse(at) >= start && Date.parse(at) < end;
  const brief = (pr: PullRequestWithActivity) => ({
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: pr.author?.login ?? null,
  });

  const pullRequests: ReportPullRequest[] = [];
  const reviewsGiven: GivenReview[] = [];
  const reviewRequests: ReviewRequestRow[] = [];

  for (const pr of prs) {
    const counted = countedReviews(pr);

    if (pr.author?.login === login) {
      const reviews = counted.map((review) => ({
        reviewer: review.author!.login,
        state: review.state,
        submittedAt: review.submittedAt!,
        inPeriod: within(review.submittedAt),
      }));
      const inPeriod = {
        opened: within(pr.createdAt),
        merged: within(pr.mergedAt),
        closedUnmerged: pr.state === "CLOSED" && within(pr.closedAt),
        reviewed: reviews.some((review) => review.inPeriod),
      };
      if (Object.values(inPeriod).some(Boolean)) {
        pullRequests.push({
          number: pr.number,
          title: pr.title,
          url: pr.url,
          state: pr.state,
          isDraft: pr.isDraft,
          createdAt: pr.createdAt,
          mergedAt: pr.mergedAt,
          closedAt: pr.closedAt,
          additions: pr.additions ?? null,
          deletions: pr.deletions ?? null,
          changedFiles: pr.changedFiles ?? null,
          body: pr.body ?? null,
          closesIssues: (pr.closingIssuesReferences ?? []).map((issue) => issue.number),
          inPeriod,
          reviews,
        });
      }
    }

    // Their reviews, each burst of replies on one day counted once, as the
    // Reviews chart and the person page count them.
    const days = new Set<string>();
    for (const review of counted) {
      if (review.author!.login !== login) continue;
      const day = localDay(review.submittedAt!);
      const first = !days.has(day);
      days.add(day);
      if (!within(review.submittedAt)) continue;
      reviewsGiven.push({ pullRequest: brief(pr), state: review.state, submittedAt: review.submittedAt!, counted: first });
    }

    const events = pr.timelineItems.filter(isRequestEvent);
    for (const event of events) {
      if (event.__typename !== "ReviewRequestedEvent" || event.requestedReviewer === null) continue;
      if (!within(event.createdAt)) continue;
      const reviewer = event.requestedReviewer;
      let via: string | null;
      if ("slug" in reviewer) {
        if (teamRequestWinner(event, events, counted) !== login) continue;
        via = reviewer.slug;
      } else {
        if (reviewer.login !== login || isBot(reviewer)) continue;
        via = null;
      }
      const answer = counted.find((review) => review.author!.login === login && review.submittedAt! > event.createdAt);
      reviewRequests.push({
        pullRequest: brief(pr),
        requestedAt: event.createdAt,
        requestedBy: event.actor?.login ?? null,
        via,
        reviewedAt: answer?.submittedAt ?? null,
      });
    }
  }

  const issueRow = (issue: IssueWithActivity): ReportIssue => {
    const assigned = issue.timelineItems
      .filter(
        (item) =>
          item.__typename === "AssignedEvent" && item.assignee?.login === login && Date.parse(item.createdAt) < end,
      )
      .at(-1);
    return {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      state: issue.state,
      author: issue.author?.login ?? null,
      createdAt: issue.createdAt,
      closedAt: issue.closedAt,
      plannedAt: plannedAt(issue),
      assignedAt: assigned?.createdAt ?? null,
      assignedNow: issue.assignees.some((who) => who.login === login),
    };
  };
  const opened: ReportIssue[] = [];
  const assigned: ReportIssue[] = [];
  const closedWhileAssigned: ReportIssue[] = [];
  for (const issue of issues) {
    if (issue.author?.login === login && within(issue.createdAt)) opened.push(issueRow(issue));
    // Open for some of the period, and theirs for some of that.
    const openFrom = Math.max(start, Date.parse(issue.createdAt));
    const openTo = Math.min(end, issue.closedAt === null ? Infinity : Date.parse(issue.closedAt));
    const openInPeriod = openFrom < openTo;
    if (openInPeriod && heldSpans(issue, login).some((span) => span.from < openTo && span.to > openFrom)) assigned.push(issueRow(issue));
    if (issue.state === "CLOSED" && within(issue.closedAt) && issue.assignees.some((who) => who.login === login)) {
      closedWhileAssigned.push(issueRow(issue));
    }
  }

  const byCreated = <T extends { createdAt: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt);
  pullRequests.sort(byCreated);
  reviewsGiven.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  reviewRequests.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  opened.sort(byCreated);
  assigned.sort(byCreated);
  closedWhileAssigned.sort((a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? ""));

  const waiting = awaitingReview(prs, login, now);
  const teamWaiting = awaitingTeamReview(prs, login, input.teams, now);
  const known =
    everyone(prs).includes(login) ||
    issues.some((issue) => issue.author?.login === login || issue.assignees.some((who) => who.login === login));
  const { syncedAt, backfillDone, staleAfterMs } = input.sync;

  return {
    repository: input.repository,
    login,
    known,
    period: {
      from: input.period.from,
      to: input.period.to,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    },
    mirror: {
      syncedAt: syncedAt === null ? null : new Date(syncedAt).toISOString(),
      stale: syncedAt === null || now - syncedAt > staleAfterMs,
      backfillDone,
    },
    summary: {
      pullRequestsOpened: pullRequests.filter((pr) => pr.inPeriod.opened).length,
      pullRequestsMerged: pullRequests.filter((pr) => pr.inPeriod.merged).length,
      pullRequestsClosedUnmerged: pullRequests.filter((pr) => pr.inPeriod.closedUnmerged).length,
      reviewsGiven: reviewsGiven.filter((review) => review.counted).length,
      reviewsGivenAll: reviewsGiven.length,
      pullRequestsReviewed: new Set(reviewsGiven.map((review) => review.pullRequest.number)).size,
      reviewRequests: reviewRequests.length,
      reviewsReceived: pullRequests.reduce((sum, pr) => sum + pr.reviews.filter((review) => review.inPeriod).length, 0),
      awaitingReview: waiting.length,
      issuesOpened: opened.length,
      issuesAssigned: assigned.length,
      assignedIssuesClosed: closedWhileAssigned.length,
    },
    pullRequests,
    reviewsGiven,
    reviewRequests,
    awaitingReview: waiting,
    awaitingTeamReview: teamWaiting,
    issues: { opened, assigned, closedWhileAssigned },
  };
}

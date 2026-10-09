// Where everything opened in the period has got to, and by which path: the
// counts the overview's flow diagram draws on its lines. The boxes on that
// diagram are the stages' queues, which the stage summaries already hold.
//
// Neither object type walks a straight line. An issue can be assigned without
// ever reaching a milestone or project; a pull request can be reviewed without
// anyone being asked, merge with no review, or be sent back for changes. Each
// of those paths is counted here so the diagram can draw it.
import { isBot, type IssueWithActivity, type PullRequestWithActivity } from "../mirror/github.js";

import { countedReviews } from "./reviews.js";

export interface IssueFlow {
  /** Issues opened in the period. */
  opened: number;
  /** Reached a milestone or project. */
  planned: number;
  /** Reached a plan and then someone was assigned. */
  assignedFromPlan: number;
  /** Assigned without ever reaching a plan. */
  assignedWithoutPlan: number;
  /** Closed after someone was assigned, by either path. */
  closedAssigned: number;
  /** Closed in a plan with nobody assigned. */
  closedPlanned: number;
  /** Closed before reaching a plan or an owner. */
  closedUntriaged: number;
}

export interface PullRequestFlow {
  /** Pull requests opened in the period. */
  opened: number;
  /** Spent some time as a draft. */
  drafted: number;
  /** A reviewer was asked at least once. */
  asked: number;
  /** Reviewed by someone, though nobody was asked. */
  reviewedUnasked: number;
  /** Someone requested changes at least once. */
  changesRequested: number;
  /** Approved by someone other than the author. */
  approved: number;
  merged: number;
  /** Merged with no review from anyone but the author. */
  mergedUnreviewed: number;
  /** Closed without merging. */
  closed: number;
}

export interface Flow {
  issues: IssueFlow;
  pullRequests: PullRequestFlow;
}

const openedIn = (createdAt: string, from: number, to: number) => {
  const at = Date.parse(createdAt);
  return at >= from && at < to;
};

/** Nothing opened: what a page with no repository, or an empty period, draws. */
export function emptyFlow(): Flow {
  return {
    issues: {
      opened: 0,
      planned: 0,
      assignedFromPlan: 0,
      assignedWithoutPlan: 0,
      closedAssigned: 0,
      closedPlanned: 0,
      closedUntriaged: 0,
    },
    pullRequests: {
      opened: 0,
      drafted: 0,
      asked: 0,
      reviewedUnasked: 0,
      changesRequested: 0,
      approved: 0,
      merged: 0,
      mergedUnreviewed: 0,
      closed: 0,
    },
  };
}

export function issueFlow(issues: readonly IssueWithActivity[], from: number, to: number): IssueFlow {
  const flow = emptyFlow().issues;
  for (const issue of issues) {
    if (isBot(issue.author) || !openedIn(issue.createdAt, from, to)) continue;
    const planned = issue.timelineItems.some(
      (item) => item.__typename === "MilestonedEvent" || item.__typename === "AddedToProjectV2Event",
    );
    const assigned = issue.timelineItems.some((item) => item.__typename === "AssignedEvent");
    const closed = issue.state === "CLOSED";
    flow.opened += 1;
    if (planned) flow.planned += 1;
    if (planned && assigned) flow.assignedFromPlan += 1;
    if (!planned && assigned) flow.assignedWithoutPlan += 1;
    if (closed && assigned) flow.closedAssigned += 1;
    if (closed && planned && !assigned) flow.closedPlanned += 1;
    if (closed && !planned && !assigned) flow.closedUntriaged += 1;
  }
  return flow;
}

export function pullRequestFlow(pullRequests: readonly PullRequestWithActivity[], from: number, to: number): PullRequestFlow {
  const flow = emptyFlow().pullRequests;
  for (const pr of pullRequests) {
    if (isBot(pr.author) || !openedIn(pr.createdAt, from, to)) continue;
    const reviews = countedReviews(pr);
    const asked = pr.timelineItems.some((item) => item.__typename === "ReviewRequestedEvent");
    const drafted =
      pr.isDraft ||
      pr.timelineItems.some(
        (item) => item.__typename === "ReadyForReviewEvent" || item.__typename === "ConvertToDraftEvent",
      );
    flow.opened += 1;
    if (drafted) flow.drafted += 1;
    if (asked) flow.asked += 1;
    if (!asked && reviews.length > 0) flow.reviewedUnasked += 1;
    if (reviews.some((review) => review.state === "CHANGES_REQUESTED")) flow.changesRequested += 1;
    if (reviews.some((review) => review.state === "APPROVED")) flow.approved += 1;
    if (pr.mergedAt !== null) {
      flow.merged += 1;
      if (reviews.length === 0) flow.mergedUnreviewed += 1;
    } else if (pr.state === "CLOSED") {
      flow.closed += 1;
    }
  }
  return flow;
}

export function flowOf(
  input: { pullRequests: readonly PullRequestWithActivity[]; issues: readonly IssueWithActivity[] },
  from: number,
  to: number,
): Flow {
  return { issues: issueFlow(input.issues, from, to), pullRequests: pullRequestFlow(input.pullRequests, from, to) };
}

// GitHub's GraphQL objects as this plugin asks for them. Field names are
// GitHub's own, so the store mirrors GitHub rather than a model of our own.

export interface Actor {
  __typename?: string;
  login: string;
}

export interface Team {
  __typename: "Team";
  slug: string;
}

/** A requested reviewer: a User, Bot, or Mannequin carries `login`; a Team carries `slug`. */
export type RequestedReviewer = (Actor & { __typename: string }) | Team | null;

export interface PullRequestReview {
  id: string;
  state: "PENDING" | "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED";
  submittedAt: string | null;
  createdAt: string;
  author: Actor | null;
}

export type TimelineItem =
  | {
      __typename: "ReviewRequestedEvent" | "ReviewRequestRemovedEvent";
      id: string;
      createdAt: string;
      actor: Actor | null;
      requestedReviewer: RequestedReviewer;
    }
  | {
      __typename: "ReadyForReviewEvent" | "ConvertToDraftEvent";
      id: string;
      createdAt: string;
      actor: Actor | null;
    };

export interface Connection<T> {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: T[];
}

/** A pull request without its connections: what the pull_requests table holds. */
export interface PullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  author: Actor | null;
  /** Who it is assigned to now. Empty for most rows: GitHub assigns nobody by default. */
  assignees: Actor[];
}

/** A pull request as one page of the sync returns it, connections and all. */
export interface PullRequestNode extends Omit<PullRequest, "assignees"> {
  /** Optional, so a fixture or an older page without the field still parses. */
  assignees?: { nodes: Actor[] };
  reviews: Connection<PullRequestReview>;
  timelineItems: Connection<TimelineItem>;
}

/** A pull request with everything the store holds for it. */
export interface PullRequestWithActivity extends PullRequest {
  reviews: PullRequestReview[];
  timelineItems: TimelineItem[];
}

/** GitHub marks apps and bots as `Bot`; their names end in `[bot]` in REST. */
export function isBot(actor: { __typename?: string; login?: string } | null): boolean {
  if (actor === null) return false;
  return actor.__typename === "Bot" || (actor.login ?? "").endsWith("[bot]");
}

const PERSON_FRAGMENT = `__typename ... on User { login } ... on Team { slug } ... on Bot { login } ... on Mannequin { login }`;

/** Which timeline events the sync asks for. */
export const TIMELINE_ITEM_TYPES =
  "[REVIEW_REQUESTED_EVENT, REVIEW_REQUEST_REMOVED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]";

const REVIEW_FIELDS = `id state submittedAt createdAt author { __typename login }`;

const TIMELINE_FIELDS = `
  __typename
  ... on ReviewRequestedEvent { id createdAt actor { login } requestedReviewer { ${PERSON_FRAGMENT} } }
  ... on ReviewRequestRemovedEvent { id createdAt actor { login } requestedReviewer { ${PERSON_FRAGMENT} } }
  ... on ReadyForReviewEvent { id createdAt actor { login } }
  ... on ConvertToDraftEvent { id createdAt actor { login } }`;

/**
 * One page of pull requests, most recently updated first, each with its
 * reviews and review-request timeline. A page of 50 costs one point of
 * GitHub's GraphQL rate limit.
 */
export const PULL_REQUESTS_QUERY = `
query($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: $first, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number title url state isDraft createdAt updatedAt closedAt mergedAt
        author { __typename login }
        assignees(first: 5) { nodes { login } }
        reviews(first: 100) {
          pageInfo { hasNextPage endCursor }
          nodes { ${REVIEW_FIELDS} }
        }
        timelineItems(first: 100, itemTypes: ${TIMELINE_ITEM_TYPES}) {
          pageInfo { hasNextPage endCursor }
          nodes { ${TIMELINE_FIELDS} }
        }
      }
    }
  }
}`;

/** The rest of one pull request's reviews, for the rare one with more than 100. */
export const MORE_REVIEWS_QUERY = `
query($id: ID!, $after: String) {
  node(id: $id) {
    ... on PullRequest {
      reviews(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ${REVIEW_FIELDS} }
      }
    }
  }
}`;

/** The rest of one pull request's timeline events. */
export const MORE_TIMELINE_QUERY = `
query($id: ID!, $after: String) {
  node(id: $id) {
    ... on PullRequest {
      timelineItems(first: 100, after: $after, itemTypes: ${TIMELINE_ITEM_TYPES}) {
        pageInfo { hasNextPage endCursor }
        nodes { ${TIMELINE_FIELDS} }
      }
    }
  }
}`;

/** An issue without its connections: what the issues table holds. */
export interface Issue {
  id: string;
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  author: Actor | null;
  /** Who it is assigned to now. Empty for most rows: GitHub assigns nobody by default. */
  assignees: Actor[];
}

/** The issue events the stages before a change is written are read from. */
export type IssueTimelineItem =
  | {
      __typename: "MilestonedEvent" | "DemilestonedEvent" | "AddedToProjectV2Event" | "ClosedEvent";
      id: string;
      createdAt: string;
    }
  | {
      __typename: "AssignedEvent" | "UnassignedEvent";
      id: string;
      createdAt: string;
      assignee: Actor | null;
    };

export interface IssueNode extends Omit<Issue, "assignees"> {
  /** Optional, so a fixture or an older page without the field still parses. */
  assignees?: { nodes: Actor[] };
  timelineItems: Connection<IssueTimelineItem>;
}

/** An issue with everything the store holds for it. */
export interface IssueWithActivity extends Issue {
  timelineItems: IssueTimelineItem[];
}

export const ISSUE_TIMELINE_ITEM_TYPES =
  "[MILESTONED_EVENT, DEMILESTONED_EVENT, ADDED_TO_PROJECT_V2_EVENT, ASSIGNED_EVENT, UNASSIGNED_EVENT, CLOSED_EVENT]";

const ISSUE_TIMELINE_FIELDS = `
  __typename
  ... on MilestonedEvent { id createdAt }
  ... on DemilestonedEvent { id createdAt }
  ... on AddedToProjectV2Event { id createdAt }
  ... on AssignedEvent { id createdAt assignee { ... on User { login } ... on Bot { login } } }
  ... on UnassignedEvent { id createdAt assignee { ... on User { login } ... on Bot { login } } }
  ... on ClosedEvent { id createdAt }`;

/**
 * One page of issues, most recently updated first, each with the events the
 * stages read. A page of 50 costs one point of GitHub's GraphQL rate limit.
 */
export const ISSUES_QUERY = `
query($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: $first, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number title url state createdAt updatedAt closedAt
        author { __typename login }
        assignees(first: 5) { nodes { login } }
        timelineItems(first: 100, itemTypes: ${ISSUE_TIMELINE_ITEM_TYPES}) {
          pageInfo { hasNextPage endCursor }
          nodes { ${ISSUE_TIMELINE_FIELDS} }
        }
      }
    }
  }
}`;

/** The rest of one issue's events, for the rare one with more than 100. */
export const MORE_ISSUE_TIMELINE_QUERY = `
query($id: ID!, $after: String) {
  node(id: $id) {
    ... on Issue {
      timelineItems(first: 100, after: $after, itemTypes: ${ISSUE_TIMELINE_ITEM_TYPES}) {
        pageInfo { hasNextPage endCursor }
        nodes { ${ISSUE_TIMELINE_FIELDS} }
      }
    }
  }
}`;

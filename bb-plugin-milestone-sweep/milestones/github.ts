// The one module that reads GitHub. A repository's open milestones in one
// GraphQL query, then the issues in each milestone that has any, one query
// per hundred issues. One query for everything at once timed out on GitHub's
// side (HTTP 502) for a repository with a dozen busy milestones.
//
// Kept apart from the rest so it can move into a shared GitHub mirror later.
import { REPO_SLUG_PATTERN, type GhRunner } from "@danielb/gh-shared/gh";
import type { IssueStanding } from "@danielbachhuber/bb-plugin-component-library/milestones";

/** An issue in a milestone, as stored. */
export interface StoredIssue {
  number: number;
  title: string;
  url: string;
  open: boolean;
  /** Closed as not planned or a duplicate, rather than done. */
  notDone: boolean;
  assignees: string[];
  /** Epoch ms. */
  createdAt: number;
  closedAt: number | null;
  /** When it joined this milestone, epoch ms. */
  addedAt: number;
  /** Where an open issue stands; closed issues read "nobody" and nothing reads it. */
  standing: IssueStanding;
}

/** An open milestone and every issue in it, as stored. */
export interface StoredMilestone {
  /** owner/name, as GitHub spells it. */
  repo: string;
  number: number;
  title: string;
  url: string;
  due: number | null;
  createdAt: number;
  /** GitHub's own counts. */
  open: number;
  closed: number;
  issues: StoredIssue[];
}

const ISSUE_FIELDS = `
  number title url state stateReason createdAt closedAt
  assignees(first: 5) { nodes { login } }
  timelineItems(itemTypes: [MILESTONED_EVENT], last: 3) {
    nodes { ... on MilestonedEvent { createdAt milestoneTitle } }
  }
  closedByPullRequestsReferences(first: 5, includeClosedPrs: false) {
    nodes { state isDraft reviewDecision }
  }`;

/** Costs one point of the rate limit for up to 100 milestones. */
export const MILESTONES_QUERY = `
query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    milestones(first: 100, after: $after, states: [OPEN]) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url dueOn createdAt
        openIssues: issues(states: [OPEN]) { totalCount }
        closedIssues: issues(states: [CLOSED]) { totalCount }
      }
    }
  }
}`;

/** About 14 points of the rate limit per hundred issues. */
export const ISSUES_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    milestone(number: $number) {
      issues(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ${ISSUE_FIELDS} }
      }
    }
  }
}`;

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface RawIssue {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  stateReason: string | null;
  createdAt: string;
  closedAt: string | null;
  assignees: { nodes: Array<{ login: string }> };
  timelineItems: { nodes: Array<{ createdAt?: string; milestoneTitle?: string }> };
  closedByPullRequestsReferences: {
    nodes: Array<{ state: string; isDraft: boolean; reviewDecision: string | null }>;
  } | null;
}

interface RawIssues {
  pageInfo: PageInfo;
  nodes: RawIssue[];
}

export interface RawMilestone {
  number: number;
  title: string;
  url: string;
  dueOn: string | null;
  createdAt: string;
  openIssues: { totalCount: number };
  closedIssues: { totalCount: number };
}

const ORDER: readonly IssueStanding[] = ["nobody", "assigned", "draft", "review", "approved"];

/** The furthest an open pull request that closes the issue has got; otherwise whether anyone holds it. */
export function standingOf(issue: RawIssue): IssueStanding {
  let best = -1;
  for (const pr of issue.closedByPullRequestsReferences?.nodes ?? []) {
    if (pr.state !== "OPEN") continue;
    const standing: IssueStanding = pr.isDraft ? "draft" : pr.reviewDecision === "APPROVED" ? "approved" : "review";
    best = Math.max(best, ORDER.indexOf(standing));
  }
  if (best >= 0) return ORDER[best];
  return issue.assignees.nodes.length > 0 ? "assigned" : "nobody";
}

/**
 * When the issue joined the milestone: the last time it was put in one with
 * this title, or in any when none has this title, since a milestone can be
 * renamed. An issue created straight into a milestone has no event, so its
 * creation stands in.
 */
export function addedAt(issue: RawIssue, title: string): number {
  const events = issue.timelineItems.nodes.filter((event) => typeof event.createdAt === "string");
  const named = events.filter((event) => event.milestoneTitle === title);
  const pool = named.length > 0 ? named : events;
  if (pool.length === 0) return Date.parse(issue.createdAt);
  return Math.max(...pool.map((event) => Date.parse(event.createdAt!)));
}

export function toStoredIssue(issue: RawIssue, milestoneTitle: string): StoredIssue {
  const open = issue.state === "OPEN";
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    open,
    notDone: issue.stateReason === "NOT_PLANNED" || issue.stateReason === "DUPLICATE",
    assignees: issue.assignees.nodes.map((who) => who.login),
    createdAt: Date.parse(issue.createdAt),
    closedAt: issue.closedAt === null ? null : Date.parse(issue.closedAt),
    addedAt: addedAt(issue, milestoneTitle),
    standing: open ? standingOf(issue) : "nobody",
  };
}

export function toStoredMilestone(repo: string, milestone: RawMilestone, issues: readonly RawIssue[]): StoredMilestone {
  return {
    repo,
    number: milestone.number,
    title: milestone.title,
    url: milestone.url,
    due: milestone.dueOn === null ? null : Date.parse(milestone.dueOn),
    createdAt: Date.parse(milestone.createdAt),
    open: milestone.openIssues.totalCount,
    closed: milestone.closedIssues.totalCount,
    issues: issues.map((issue) => toStoredIssue(issue, milestone.title)),
  };
}

/** GitHub has no repository by that name, or gh cannot see it, such as a deleted fork. */
export class RepositoryNotFoundError extends Error {}

function graphqlData<T>(raw: string): T {
  const parsed = JSON.parse(raw) as { data?: T; errors?: Array<{ message: string; type?: string }> };
  if (parsed.errors?.length) {
    const message = parsed.errors.map((error) => error.message).join("; ");
    if (parsed.errors.every((error) => error.type === "NOT_FOUND")) throw new RepositoryNotFoundError(message);
    throw new Error(message);
  }
  if (parsed.data === undefined) throw new Error("GitHub returned no data.");
  return parsed.data;
}

/** gh exits non-zero on a GraphQL error, with the response still on stdout. */
async function graphql<T>(gh: GhRunner, args: string[]): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return graphqlData<T>(await gh.run(["api", "graphql", ...args]));
    } catch (error) {
      const stdout = (error as { stdout?: unknown }).stdout;
      if (typeof stdout === "string" && stdout.trim().startsWith("{")) return graphqlData<T>(stdout);
      // GitHub answers a slow query with a 502 now and then; one retry.
      const stderr = String((error as { stderr?: unknown }).stderr ?? "");
      if (attempt === 0 && /HTTP 50[234]/.test(stderr)) continue;
      throw error;
    }
  }
}

/** Every issue in one milestone. */
async function fetchIssues(gh: GhRunner, owner: string, name: string, number: number): Promise<RawIssue[]> {
  const issues: RawIssue[] = [];
  let after: string | null = null;
  do {
    const data: { repository: { milestone: { issues: RawIssues } | null } } = await graphql(gh, [
      "-f", `query=${ISSUES_QUERY}`,
      "-f", `owner=${owner}`,
      "-f", `name=${name}`,
      "-F", `number=${number}`,
      ...(after === null ? [] : ["-f", `after=${after}`]),
    ]);
    const page = data.repository.milestone?.issues;
    if (!page) break;
    issues.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after !== null);
  return issues;
}

/** Every open milestone in the repository, with every issue in each. */
export async function fetchMilestones(gh: GhRunner, slug: string): Promise<StoredMilestone[]> {
  if (!REPO_SLUG_PATTERN.test(slug)) throw new Error(`not a repository: ${slug}`);
  const [owner, name] = slug.split("/");
  const result: StoredMilestone[] = [];
  let after: string | null = null;
  do {
    const data: {
      repository: { nameWithOwner: string; milestones: { pageInfo: PageInfo; nodes: RawMilestone[] } } | null;
    } = await graphql(gh, [
      "-f", `query=${MILESTONES_QUERY}`,
      "-f", `owner=${owner}`,
      "-f", `name=${name}`,
      ...(after === null ? [] : ["-f", `after=${after}`]),
    ]);
    if (data.repository === null) throw new RepositoryNotFoundError(`${slug} was not found.`);
    const { nameWithOwner, milestones } = data.repository;
    for (const milestone of milestones.nodes) {
      const empty = milestone.openIssues.totalCount + milestone.closedIssues.totalCount === 0;
      const issues = empty ? [] : await fetchIssues(gh, owner, name, milestone.number);
      result.push(toStoredMilestone(nameWithOwner, milestone, issues));
    }
    after = milestones.pageInfo.hasNextPage ? milestones.pageInfo.endCursor : null;
  } while (after !== null);
  return result;
}

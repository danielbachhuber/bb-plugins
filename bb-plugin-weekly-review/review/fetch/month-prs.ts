import { runJson } from "./shell.js";
import { countReviewed, monthRange, type MonthPrCounts, type ReviewedNode } from "../wins.js";
import type { Month } from "../wins.js";

const QUERY = `query($opened: String!, $merged: String!, $reviewed: String!, $login: String!, $after: String) {
  opened: search(query: $opened, type: ISSUE, first: 1) { issueCount }
  merged: search(query: $merged, type: ISSUE, first: 1) { issueCount }
  reviewed: search(query: $reviewed, type: ISSUE, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { number author { login } reviews(author: $login, first: 100) { nodes { submittedAt } } } }
  }
}`;

/**
 * How many pull requests the author opened, had merged, and reviewed in the
 * month, in the configured repository. One GraphQL request per hundred
 * reviewed pull requests, usually one.
 *
 * Opened and merged are GitHub's own counts. Reviewed counts other people's
 * pull requests with a review the author submitted inside the month, read
 * from each review's date, since a search can only filter on when a pull
 * request was last updated.
 */
export async function fetchMonthPrCounts(month: Month, config: { gh: string; repo: string; author: string }): Promise<MonthPrCounts> {
  const { gh, repo, author } = config;
  const { from, to } = monthRange(month);
  const scope = `repo:${repo} is:pr`;
  const vars = [
    "-f", `query=${QUERY}`,
    "-f", `opened=${scope} author:${author} created:${from}..${to}`,
    "-f", `merged=${scope} author:${author} merged:${from}..${to}`,
    "-f", `reviewed=${scope} reviewed-by:${author} -author:${author} updated:>=${from}`,
    "-f", `login=${author}`,
  ];

  let opened = 0;
  let merged = 0;
  const nodes: ReviewedNode[] = [];
  let after: string | null = null;
  for (;;) {
    const response: any = await runJson<any>(gh, ["api", "graphql", ...vars, ...(after === null ? [] : ["-f", `after=${after}`])]);
    const data = response.data;
    opened = data.opened.issueCount;
    merged = data.merged.issueCount;
    nodes.push(...data.reviewed.nodes);
    if (!data.reviewed.pageInfo.hasNextPage) break;
    after = data.reviewed.pageInfo.endCursor;
  }
  return { opened, merged, reviewed: countReviewed(nodes, month, author) };
}

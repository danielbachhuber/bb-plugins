import type { GitHubItem } from "bb-plugin-harvest/github";
import type { ThreadContext } from "./contract.js";

/**
 * What a Harvest timer started from the banner is recorded against.
 *
 * An issue assigned to you comes first: it is the work being billed, and a
 * pull request is how that work arrives. Without one, the pull request, and
 * without that, the first issue the thread is about.
 */
export function harvestItem(context: ThreadContext): GitHubItem | null {
  const issueItem = (issue: ThreadContext["issues"][number]): GitHubItem => ({
    repo: issue.repo,
    number: issue.number,
    title: issue.title ?? `#${issue.number}`,
    url: issue.url,
  });

  const assigned = context.issues.find((issue) => issue.assignedToMe);
  if (assigned) return issueItem(assigned);
  if (context.pullRequest) {
    const { repo, number, title, url } = context.pullRequest;
    return { repo, number, title, url };
  }
  const first = context.issues[0];
  return first ? issueItem(first) : null;
}

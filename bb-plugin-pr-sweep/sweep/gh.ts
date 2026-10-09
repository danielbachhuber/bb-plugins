import { fetchStacks, stackKey } from "@danielb/gh-shared/gh";
import { fetchThreadCounts, threadKey } from "./threads.js";
import {
  GhUnavailableError,
  REPO_SLUG_PATTERN,
  createGhRunner,
  type GhRunner,
} from "@danielb/gh-shared/gh";

// Re-exported so this plugin's own modules keep importing from one place.
export { GhUnavailableError, REPO_SLUG_PATTERN, createGhRunner };
export type { GhRunner };

import { classify } from "./classify.js";
import type { ClassifiedRow, RawPullRequest, SweepResult } from "./types.js";


export const PR_LIST_FIELDS = [
  "number", "title", "url", "author", "isDraft", "mergeable", "mergeStateStatus",
  "reviewRequests", "latestReviews", "reviews", "reviewDecision", "statusCheckRollup",
  // Who spoke last: an approved PR whose newest comment is not the author's is
  // usually waiting on a reply, and that is invisible in the review states.
  "comments",
  // How long a pull request has sat with its reviewers, for the stale flag.
  "updatedAt",
  // The row's size and the branch a conflict is with.
  "additions", "deletions", "baseRefName",
  // The commit a dismissal of failing checks is recorded against.
  "headRefOid",
  // The node id the review-thread query looks the pull request up by.
  "id",
].join(",");

const SEARCH_LIMIT = 100;




export async function discoverRepos(
  gh: GhRunner,
): Promise<{ repos: string[]; truncated: boolean }> {
  const raw = await gh.run([
    "search", "prs",
    "--author=@me",
    "--state=open",
    "--limit", String(SEARCH_LIMIT),
    "--json", "repository,number",
  ]);
  const hits = JSON.parse(raw) as Array<{ repository?: { nameWithOwner?: string } }>;
  const repos = new Set<string>();
  for (const hit of hits) {
    const slug = hit.repository?.nameWithOwner;
    if (slug && REPO_SLUG_PATTERN.test(slug)) repos.add(slug);
  }
  return { repos: [...repos].sort(), truncated: hits.length >= SEARCH_LIMIT };
}

export async function fetchRepoPullRequests(
  gh: GhRunner,
  repo: string,
): Promise<RawPullRequest[]> {
  if (!REPO_SLUG_PATTERN.test(repo)) {
    throw new Error(`Invalid repository slug: ${repo}`);
  }

  const raw = await gh.run([
    "pr", "list",
    "--repo", repo,
    "--author", "@me",
    "--state", "open",
    "--limit", "100",
    "--json", PR_LIST_FIELDS,
  ]);
  const prs = JSON.parse(raw) as RawPullRequest[];

  // GitHub computes mergeability lazily, so a first query returns UNKNOWN
  // often. Re-query those rows once; an UNKNOWN that survives stays UNKNOWN
  // and is never reported as clean.
  for (const pr of prs) {
    if (pr.mergeable !== "UNKNOWN") continue;
    try {
      const detail = await gh.run([
        "pr", "view", String(pr.number),
        "--repo", repo,
        "--json", "number,mergeable,mergeStateStatus",
      ]);
      const parsed = JSON.parse(detail) as { mergeable?: string; mergeStateStatus?: string };
      if (parsed.mergeable && parsed.mergeable !== "UNKNOWN") {
        pr.mergeable = parsed.mergeable;
        pr.mergeStateStatus = parsed.mergeStateStatus ?? pr.mergeStateStatus;
      }
    } catch {
      // Leave it UNKNOWN. The classifier flags that as mergeable-unknown.
    }
  }

  return prs;
}

/**
 * Narrows the sweep to the repositories checked out on this machine.
 *
 * Applied before the per-repository fan-out rather than to the finished rows,
 * because the fan-out is the expensive part: one `gh pr list` per repository,
 * plus a `gh pr view` for every pull request whose mergeability came back
 * UNKNOWN. An excluded repository costs nothing.
 */
export interface RepoScope {
  allows(repo: string): boolean;
}

export async function runSweep(
  gh: GhRunner,
  now: () => number,
  scope?: RepoScope,
  /**
   * Whether a repository waives the reviewer requirement. A predicate rather
   * than a list, so the sweep stays ignorant of how the setting is written.
   */
  reviewerOptional?: (repo: string) => boolean,
): Promise<SweepResult> {
  const { repos: discovered, truncated } = await discoverRepos(gh);
  const repos: string[] = [];
  const skippedRepos: string[] = [];
  for (const repo of discovered) {
    (scope && !scope.allows(repo) ? skippedRepos : repos).push(repo);
  }
  const rows: ClassifiedRow[] = [];
  const failedRepos: string[] = [];
  const ids: string[] = [];

  for (const repo of repos) {
    try {
      const prs = await fetchRepoPullRequests(gh, repo);
      for (const pr of prs) if (pr.id) ids.push(pr.id);
      rows.push(
        ...classify(prs, repo, {
          reviewerOptional: reviewerOptional?.(repo) ?? false,
        }),
      );
    } catch (error) {
      if (error instanceof GhUnavailableError) throw error;
      failedRepos.push(repo);
    }
  }

  // One extra call for every hundred rows. A failure here loses a hint, not
  // the sweep, so the rows are returned either way.
  try {
    const counts = await fetchThreadCounts(gh, ids);
    for (const row of rows) {
      const found = counts.get(threadKey(row.repo, row.number));
      if (!found) continue;
      row.unresolvedThreads = found.unresolved;
      row.outdatedThreads = found.outdated;
      row.repliedThreads = found.replied;
      row.unansweredBy = found.unansweredBy;
      row.inlineComments = found.inlineComments;
    }
  } catch {
    // Leave the counts at zero.
  }

  // And one for the stacks: a pull request's base is often not yours, so this
  // reads every open pull request in the swept repositories. A failure loses
  // the chips, not the sweep.
  try {
    const stacks = await fetchStacks(gh, repos);
    for (const row of rows) row.stack = stacks.get(stackKey(row.repo, row.number)) ?? null;
  } catch {
    // Leave every row out of a stack.
  }

  return { rows, repos, failedRepos, skippedRepos, truncated, sweptAt: now() };
}

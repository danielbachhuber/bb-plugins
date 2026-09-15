/**
 * The only module here that touches the network.
 *
 * Fetching and applying are separated from classifying so the classifier stays
 * a pure function of a payload, and so every write to GitHub goes through one
 * reviewable place.
 */

import { REPO_SLUG_PATTERN, type GhRunner } from '@danielb/gh-shared/gh';

import { rankRows, toRow } from './classify.js';
import type { RawIssue, TriageRow } from './types.js';

/** `gh issue list` will not return more than this in one call. */
export const FETCH_LIMIT = 1000;

const FIELDS = [
  'number',
  'title',
  'url',
  'body',
  'createdAt',
  'updatedAt',
  'author',
  'assignees',
  'labels',
  'milestone',
  'comments',
  'issueType',
].join(',');

export class InvalidRepoError extends Error {
  constructor(repo: string) {
    super(`"${repo}" is not an owner/name repository slug.`);
    this.name = 'InvalidRepoError';
  }
}

export function assertRepoSlug(repo: string): void {
  if (!REPO_SLUG_PATTERN.test(repo)) throw new InvalidRepoError(repo);
}

export interface FetchResult {
  rows: TriageRow[];
  /** True when the repo has more open issues than one call can return. */
  truncated: boolean;
}

export async function fetchOpenIssues(gh: GhRunner, repo: string, now: Date): Promise<FetchResult> {
  assertRepoSlug(repo);
  const stdout = await gh.run([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    String(FETCH_LIMIT),
    '--json',
    FIELDS,
  ]);
  const parsed = JSON.parse(stdout) as RawIssue[];
  const rows = parsed
    .filter((issue) => typeof issue?.number === 'number')
    .map((issue) => toRow(issue, repo, now));
  return { rows: rankRows(rows), truncated: parsed.length >= FETCH_LIMIT };
}

/**
 * Posts a comment, closes an issue, or both.
 *
 * Ordered so the comment lands first: a close that fails leaves an explanatory
 * comment behind, while a comment that fails after a close leaves an issue shut
 * with no reason on it.
 */
export async function applyDisposition(
  gh: GhRunner,
  repo: string,
  number: number,
  options: { comment: string | null; close: boolean },
): Promise<void> {
  assertRepoSlug(repo);
  if (options.comment && options.comment.trim().length > 0) {
    await gh.run(['issue', 'comment', String(number), '--repo', repo, '--body', options.comment]);
  }
  if (options.close) {
    await gh.run(['issue', 'close', String(number), '--repo', repo]);
  }
}

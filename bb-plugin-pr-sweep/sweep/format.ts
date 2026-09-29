import type { ChecksSummary } from "./types.js";

/**
 * The short facts on a row's number line, after its flags. Pure, so each
 * wording is tested without drawing the list.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Compact relative age, read by scanning rather than by reading. Every unit
 * rounds down, so a row never claims to be older than it is.
 */
export function relativeTime(at: number, now: number): string {
  const elapsed = now - at;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;
  if (elapsed < MONTH) return `${Math.floor(elapsed / WEEK)}w ago`;
  if (elapsed < YEAR) return `${Math.floor(elapsed / MONTH)}mo ago`;
  return `${Math.floor(elapsed / YEAR)}y ago`;
}

/**
 * Checks, most consequential count first. Zeroes are left out. Joined with
 * commas, because the number line already uses dots between facts.
 */
export function checksLabel(checks: ChecksSummary): string {
  const parts: string[] = [];
  if (checks.fail) parts.push(`${checks.fail} fail`);
  if (checks.pending) parts.push(`${checks.pending} running`);
  if (checks.cancelled) parts.push(`${checks.cancelled} cancelled`);
  if (checks.pass) parts.push(`${checks.pass} pass`);
  if (checks.skip) parts.push(`${checks.skip} skip`);
  return parts.length ? parts.join(", ") : "no checks";
}

export interface ReviewState {
  approvedBy: readonly string[];
  waitingOn: readonly string[];
  awaitingReReview: boolean;
  unresolvedThreads: number;
  outdatedThreads: number;
  notedBy: readonly string[];
  lastCommentBy: string | null;
}

/**
 * Where review stands. Approvals and outstanding reviewers are not
 * alternatives, so both show: a merge decision needs the approval that stands
 * and anyone asked who has not answered. The rest are the comments an approval
 * hides: inline threads, a review with a written body, and someone else having
 * the last word.
 */
export function reviewFacts(row: ReviewState): string[] {
  const facts: string[] = [];
  if (row.approvedBy.length) facts.push(`approved by ${row.approvedBy.join(", ")}`);
  if (row.waitingOn.length) facts.push(`waiting on ${row.waitingOn.join(", ")}`);
  if (row.awaitingReReview) facts.push("awaiting re-review");
  if (row.unresolvedThreads > 0) {
    const outdated = row.outdatedThreads > 0 ? `, ${row.outdatedThreads} outdated` : "";
    facts.push(
      `${row.unresolvedThreads} unresolved comment${row.unresolvedThreads === 1 ? "" : "s"}${outdated}`,
    );
  }
  if (row.notedBy.length) facts.push(`notes from ${row.notedBy.join(", ")}`);
  if (row.lastCommentBy) facts.push(`${row.lastCommentBy} commented last`);
  return facts.length ? facts : ["no reviews yet"];
}

/**
 * Every fact for one row. The age comes first, because a Later row's single
 * line shows only the first fact. The repository earns a place only when the
 * list spans more than one.
 */
export function factsFor(
  row: ReviewState & { repo: string; updatedAt: number; checks: ChecksSummary },
  now: number,
  showRepo: boolean,
): string[] {
  return [
    relativeTime(row.updatedAt, now),
    ...(showRepo ? [row.repo] : []),
    checksLabel(row.checks),
    ...reviewFacts(row),
  ];
}

import { returnsInLabel } from "./actions.js";
import type { ChangeSize } from "./types.js";

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
 * rounds down, so a row never claims to be older than it is. The same wording
 * as the other sweeps' lists.
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

/** "+18 −4". A minus sign for the deletions, not a hyphen. */
export function shortSizeLabel(size: ChangeSize): string {
  return `+${size.additions} −${size.deletions}`;
}

/**
 * Every fact for one row. The age of the request comes first, because a Later
 * row's single line shows only the first fact. The repository earns a place
 * only when the list spans more than one. The author is followed by who was
 * asked to review. An ignored review also says when it
 * comes back, since the deferral undoes itself.
 */
export function factsFor(
  row: {
    repo: string;
    author: string;
    requestedAt: number;
    size: ChangeSize;
    snoozedUntil: number | null;
    threadId: string | null;
    requestedReviewers: readonly string[];
  },
  now: number,
  showRepo: boolean,
): string[] {
  return [
    relativeTime(row.requestedAt, now),
    ...(showRepo ? [row.repo] : []),
    row.author,
    // "you, platform": you first, as the classifier orders them. Left out when
    // the set came back empty, which is a data gap rather than "nobody".
    ...(row.requestedReviewers.length ? [row.requestedReviewers.join(", ")] : []),
    shortSizeLabel(row.size),
    ...(row.snoozedUntil !== null && !row.threadId ? [returnsInLabel(row.snoozedUntil, now)] : []),
  ];
}

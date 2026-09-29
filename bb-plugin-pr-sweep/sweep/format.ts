import type { ChecksSummary } from "./types.js";

/**
 * The row's age, and the checks in words for the tooltip on their icon. Pure,
 * so each wording is tested without drawing the list.
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

/** Checks, most consequential count first, with zeroes left out: "2 fail, 7 pass". */
export function checksLabel(checks: ChecksSummary): string {
  const parts: string[] = [];
  if (checks.fail) parts.push(`${checks.fail} fail`);
  if (checks.pending) parts.push(`${checks.pending} running`);
  if (checks.cancelled) parts.push(`${checks.cancelled} cancelled`);
  if (checks.pass) parts.push(`${checks.pass} pass`);
  if (checks.skip) parts.push(`${checks.skip} skip`);
  return parts.length ? parts.join(", ") : "no checks";
}

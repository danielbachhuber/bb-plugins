import type { StackPosition } from "@danielb/gh-shared/gh";
import type { Flag, Run } from "sweep-ui/types";
import { DISPLAY_SECTIONS, hasOnlyPassiveFlags, sectionForRow } from "./actions.js";

/**
 * Which run, and so which tier, each pull request belongs in, and the order
 * the list draws them in. Pure: every input is something the sweep already
 * fetched or the plugin already stores, so the same listing always draws the
 * same list.
 *
 * The section rules in `displaySection` stay the authority. Each run is one
 * or more of today's sections, so a pull request lands where the table put it.
 */

/** One row of the listing, as the panel receives it. */
export interface ListedPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  flags: string[];
  group: "needs-action" | "ready-to-merge" | "clean";
  checks: {
    pass: number;
    fail: number;
    skip: number;
    pending: number;
    cancelled: number;
    total: number;
  };
  approvedBy: string[];
  commentedBy: string[];
  waitingOn: string[];
  awaitingReReview: boolean;
  lastCommentBy: string | null;
  unresolvedThreads: number;
  outdatedThreads: number;
  repliedThreads?: number;
  unansweredBy?: string[];
  /** Inline review comments, resolved threads included. */
  inlineComments?: number;
  stack?: StackPosition | null;
  notedBy: string[];
  canSpawn: boolean;
  threadId: string | null;
  threadIds: string[];
  /** When GitHub last saw activity on the pull request, in milliseconds. */
  updatedAt: number;
  /** General comments, not inline ones. */
  commentsCount: number;
  /** The local next-step note, never sent to GitHub. */
  note: string | null;
  /** The commit at the head of the branch, and the checks failing on it. */
  headSha?: string;
  failingChecks?: string[];
  /** The failing checks you dismissed on this commit, which no longer flag the row. */
  dismissedChecks?: string[];
  /** Comments since the pull request was last opened from here. */
  newComments: number;
  /**
   * Lines added and removed, the branch it merges into, and who requested
   * changes in their latest review. Optional because rows stored before the
   * sweep read them lack them until the next sweep.
   */
  additions?: number;
  deletions?: number;
  baseRefName?: string;
  changesRequestedBy?: string[];
}

export interface TierInputs {
  staleAfterDays: number;
  now: number;
}

/** Every run in list order. */
export const PR_RUNS: Run[] = [
  { id: "needs-you", label: "need you", labelOne: "needs you", tone: "late", tier: "now" },
  { id: "ready", label: "ready to merge", labelOne: "ready to merge", tone: "new", tier: "now" },
  { id: "working", label: "working", labelOne: "working", tone: "underway", tier: "now" },
  { id: "drafts", label: "drafts", labelOne: "draft", tone: "next", tier: "next" },
  { id: "waiting", label: "waiting", labelOne: "waiting", tone: "later", tier: "later" },
];

/** The track's stages, in order. `stageOf` returns an index into these. */
export const PR_STAGES = ["Draft", "Checks", "Review", "Merge"] as const;

/** Each flag in words, as the row's list flags carry it. */
export const FLAG_LABELS: Record<string, string> = {
  conflict: "merge conflict",
  "ci-failing": "CI failing",
  feedback: "reviewer feedback",
  "merge-blocked": "merge blocked",
  "mergeable-unknown": "mergeability unknown",
  "ci-cancelled": "CI cancelled",
  "ci-absent": "no CI",
  "no-reviewer": "no reviewer",
  "ci-pending": "CI running",
  "merge-ready": "ready to merge",
};

const DAY = 24 * 60 * 60_000;
const DEFAULT_STALE_AFTER_DAYS = 3;

/** The "Stale after (days)" setting. Anything but a positive whole number takes the default. */
export function parseStaleAfterDays(raw: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return DEFAULT_STALE_AFTER_DAYS;
  const days = Number(trimmed);
  return days > 0 ? days : DEFAULT_STALE_AFTER_DAYS;
}

const RUN_OF_SECTION: Record<(typeof DISPLAY_SECTIONS)[number], string> = {
  "needs-action": "needs-you",
  "ready-to-merge": "ready",
  "in-progress": "working",
  draft: "drafts",
  "waiting-on-ci": "waiting",
  "partial-approval": "waiting",
  "awaiting-review": "waiting",
};

export function runOf(row: ListedPr): string {
  return RUN_OF_SECTION[sectionForRow(row)];
}

/**
 * The track's column. A draft is in Draft whatever its checks say, since it is
 * not offered to anyone yet. Checks that are failing, running, cancelled, or
 * missing hold it in Checks; `merge-ready` is Merge; the rest are with a
 * reviewer.
 */
export function stageOf(row: ListedPr): number {
  if (row.isDraft) return 0;
  if (row.flags.some((flag) => flag.startsWith("ci-"))) return 1;
  if (row.flags.includes("merge-ready")) return 3;
  return 2;
}

/**
 * Waiting on a reviewer for longer than the setting allows. Only a pull
 * request awaiting review: one waiting on CI is waiting on a machine, and one
 * partly approved can be merged already.
 */
export function isStale(row: ListedPr, inputs: TierInputs): boolean {
  return (
    sectionForRow(row) === "awaiting-review" &&
    inputs.now - row.updatedAt > inputs.staleAfterDays * DAY
  );
}

/**
 * The row's flags as the list holds them: stale first, which tints the row
 * red and which the icon line names, then each flag that asks something of
 * the author, worst first, which the banner words for itself. A run in flight
 * and a finished pull request are not problems, so they are left out.
 */
export function flagsFor(row: ListedPr, inputs: TierInputs): Flag[] {
  const flags: Flag[] = [];
  if (isStale(row, inputs)) {
    const days = Math.floor((inputs.now - row.updatedAt) / DAY);
    flags.push({ kind: "stale", text: `Waiting ${days} ${days === 1 ? "day" : "days"}` });
  }
  for (const flag of row.flags) {
    if (hasOnlyPassiveFlags([flag])) continue;
    flags.push({ kind: "problem", text: FLAG_LABELS[flag] ?? flag });
  }
  return flags;
}

/**
 * Where a row is pinned above the rest: 0 for one waiting on a reviewer past
 * "Stale after (days)", 1 for one with a thread at work on it, and null for
 * the rest.
 */
export function pinOf(row: ListedPr, inputs: TierInputs): 0 | 1 | null {
  if (isStale(row, inputs)) return 0;
  if (runOf(row) === "working") return 1;
  return null;
}

/**
 * Newest first, by GitHub's last activity, with the overdue pull requests and
 * then the ones being worked on pinned above the rest. Repository and number
 * break ties, so rows sharing a timestamp do not reshuffle between sweeps.
 */
export function sortPrs(rows: ListedPr[], inputs: TierInputs): ListedPr[] {
  const keyed = rows.map((row) => ({ row, pin: pinOf(row, inputs) ?? 2 }));
  keyed.sort(
    (a, b) =>
      a.pin - b.pin ||
      b.row.updatedAt - a.row.updatedAt ||
      a.row.repo.localeCompare(b.row.repo) ||
      a.row.number - b.row.number,
  );
  return keyed.map((entry) => entry.row);
}

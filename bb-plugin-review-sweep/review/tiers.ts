import type { Flag, Run } from "sweep-ui/types";
import type { StackPosition } from "@danielb/gh-shared/gh";
import { ageInDays, type ChangeSize, type ChecksSummary, type ReviewState, type RowReviewer } from "./types.js";

/**
 * Which run, and so which tier, each review request belongs in, and the order
 * the list draws them in. Pure: every input is something the sweep already
 * fetched or the plugin already stores, so the same listing always draws the
 * same list.
 */

/** One row of the listing, as the panel receives it. */
export interface ListedReview {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  isDraft: boolean;
  state: ReviewState;
  requestedAt: number;
  lastReviewedAt: number | null;
  requestedReviewers: string[];
  size: ChangeSize;
  canSpawn: boolean;
  threadId: string | null;
  /** How many general comments the pull request has. */
  comments: number;
  /** The head commit's checks, all zero when it has none. */
  checks: ChecksSummary;
  /** Everyone else asked to review or who has reviewed. */
  reviewers: RowReviewer[];
  /** Where it sits in a stack of pull requests, or null when it is in none. */
  stack: StackPosition | null;
  /** The local next-step note, never sent to GitHub. */
  note: string | null;
  /** Comments since the pull request was last opened from here. */
  newComments: number;
}

export interface TierInputs {
  staleAfterDays: number;
  now: number;
}

/** Every run in list order. */
export const REVIEW_RUNS: Run[] = [
  { id: "re-review", label: "re-reviews", labelOne: "re-review", tone: "new", tier: "now" },
  { id: "overdue", label: "waiting too long", labelOne: "waiting too long", tone: "late", tier: "now" },
  { id: "reviewing", label: "reviewing", labelOne: "reviewing", tone: "underway", tier: "now" },
  { id: "to-review", label: "to review", labelOne: "to review", tone: "next", tier: "next" },
  { id: "drafts", label: "drafts", labelOne: "draft", tone: "later", tier: "later" },
];

/** The track's stages, in order. `stageOf` returns an index into these. */
export const REVIEW_STAGES = ["Requested", "Reviewing", "Re-review"] as const;

/** Waited on at least the setting's days, counted in whole days as the age column did. */
function isOverdue(row: ListedReview, inputs: TierInputs): boolean {
  return ageInDays(row.requestedAt, inputs.now) >= inputs.staleAfterDays;
}

/**
 * A re-review comes first, because the author is blocked on you and it is
 * usually the quickest to clear, unless it went back to draft. A thread
 * outranks the draft: a review being worked on is stronger evidence.
 */
export function runOf(row: ListedReview, inputs: TierInputs): string {
  if (row.state === "re-review" && !row.isDraft) return "re-review";
  if (row.threadId) return "reviewing";
  if (row.isDraft) return "drafts";
  if (isOverdue(row, inputs)) return "overdue";
  return "to-review";
}

/** The track's column: Re-review, then Reviewing once a thread exists, else Requested. */
export function stageOf(row: ListedReview): number {
  if (row.state === "re-review") return 2;
  if (row.threadId) return 1;
  return 0;
}

const DAY = 86_400_000;

/**
 * "Waiting 5 days", on a request in the overdue run only. Elsewhere the run
 * already says why the row is where it is, and a red flag on a draft or a
 * running review would contradict it.
 */
export function flagsFor(row: ListedReview, inputs: TierInputs): Flag[] {
  if (runOf(row, inputs) !== "overdue") return [];
  const days = Math.floor((inputs.now - row.requestedAt) / DAY);
  return [{ kind: "stale", text: `Waiting ${days} ${days === 1 ? "day" : "days"}` }];
}

/**
 * Run order first, which also puts Now before Next before Later. Within a run,
 * oldest request first, as the table sorted. Repository and number break ties,
 * so rows do not reshuffle between sweeps.
 */
export function sortReviews(rows: ListedReview[], inputs: TierInputs): ListedReview[] {
  const runOrder = new Map(REVIEW_RUNS.map((run, index) => [run.id, index]));
  const keyed = rows.map((row) => ({
    row,
    run: runOrder.get(runOf(row, inputs)) ?? REVIEW_RUNS.length,
  }));
  keyed.sort(
    (a, b) =>
      a.run - b.run ||
      a.row.requestedAt - b.row.requestedAt ||
      a.row.repo.localeCompare(b.row.repo) ||
      a.row.number - b.row.number,
  );
  return keyed.map((entry) => entry.row);
}

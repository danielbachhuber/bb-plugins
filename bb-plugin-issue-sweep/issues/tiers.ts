import type { Run } from "sweep-ui/types";

/**
 * Which run, and so which tier, each issue belongs in, and the order the list
 * draws them in. Pure: every input is something the sweep already fetched or
 * the plugin already stores, so the same listing always draws the same list.
 */

/** One row of the listing, as the panel receives it. */
export interface ListedIssue {
  repo: string;
  number: number;
  title: string;
  url: string;
  labels: string[];
  boardStatus: string | null;
  onBoard: boolean;
  blockedBy: number;
  closingPr: number | null;
  subtasks?: { completed: number; total: number; source: "sub-issues" | "tasks" } | null;
  threadId: string | null;
  canSpawn: boolean;
  createdAt: number;
  updatedAt: number;
  commentsCount: number;
  /** The local next-step note, never sent to GitHub. */
  note: string | null;
  /** Comments since the issue was last opened from here. */
  newComments: number;
  parent: { number: number; title: string; url: string } | null;
}

export interface TierInputs {
  /** "Statuses counted in the sidebar": what Next is made of. */
  countedStatuses: string[];
  /** "Board status when a closing pull request opens": waiting on a reviewer. */
  reviewStatus: string;
  /** The track's stages, in order. */
  boardStages: string[];
  staleAfterDays: number;
  now: number;
}

/**
 * Every run in list order. A row that fits more than one takes the first, so
 * an issue with a thread and new comments is in "new comments".
 */
export const ISSUE_RUNS: Run[] = [
  { id: "new-comments", label: "new comments", tone: "new", tier: "now" },
  { id: "stale", label: "stale", tone: "late", tier: "now" },
  { id: "working", label: "working", tone: "underway", tier: "now" },
  { id: "to-start", label: "to start", tone: "next", tier: "next" },
  { id: "waiting", label: "waiting on review", tone: "later", tier: "later" },
  { id: "later", label: "later", tone: "later", tier: "later" },
  { id: "blocked", label: "blocked", tone: "later", tier: "later" },
];

const DAY = 24 * 60 * 60_000;
const DEFAULT_STALE_AFTER_DAYS = 7;

/** The "Stale after (days)" setting. Anything but a positive whole number takes the default. */
export function parseStaleAfterDays(raw: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return DEFAULT_STALE_AFTER_DAYS;
  const days = Number(trimmed);
  return days > 0 ? days : DEFAULT_STALE_AFTER_DAYS;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Same rule as the sidebar badge: no counted statuses counts every status. */
function isCounted(row: ListedIssue, inputs: TierInputs): boolean {
  if (!row.onBoard || row.boardStatus === null) return false;
  if (inputs.countedStatuses.length === 0) return true;
  return inputs.countedStatuses.some((status) => same(status, row.boardStatus!));
}

/**
 * Has sub-issues. A task list in the body does not count: its items are steps
 * of this issue, not issues someone else can pick up.
 */
function isParent(row: ListedIssue): boolean {
  return row.subtasks?.source === "sub-issues" && row.subtasks.total > 0;
}

function isWaiting(row: ListedIssue, inputs: TierInputs): boolean {
  return inputs.reviewStatus.trim() !== "" && row.boardStatus !== null && same(row.boardStatus, inputs.reviewStatus);
}

/** Something you meant to be doing that has not moved for the configured number of days. */
export function isStale(row: ListedIssue, inputs: TierInputs): boolean {
  return (
    isCounted(row, inputs) &&
    row.blockedBy === 0 &&
    inputs.now - row.updatedAt > inputs.staleAfterDays * DAY
  );
}

export function runOf(row: ListedIssue, inputs: TierInputs): string {
  if (row.newComments > 0) return "new-comments";
  if (isStale(row, inputs)) return "stale";
  if (row.threadId) return "working";
  if (isCounted(row, inputs) && row.blockedBy === 0 && !isParent(row)) return "to-start";
  // Waiting before blocked: an issue in review is out of your hands already,
  // whatever else it depends on.
  if (isWaiting(row, inputs)) return "waiting";
  if (row.blockedBy > 0) return "blocked";
  return "later";
}

/** The track's column for a row, or null when its status is not one of the stages. */
export function stageOf(row: ListedIssue, boardStages: string[]): number | null {
  if (!row.onBoard || row.boardStatus === null) return null;
  const index = boardStages.findIndex((stage) => same(stage, row.boardStatus!));
  return index === -1 ? null : index;
}

/**
 * Within the "later" run: statuses in board order, then statuses the stages
 * do not name, then issues off the board, then parents. Returned as a tuple
 * compared left to right.
 */
function laterRank(row: ListedIssue, inputs: TierInputs): [number, number, string] {
  if (isParent(row)) return [3, 0, ""];
  if (!row.onBoard || row.boardStatus === null) return [2, 0, ""];
  const stage = stageOf(row, inputs.boardStages);
  if (stage !== null) return [0, stage, ""];
  return [1, 0, row.boardStatus.toLowerCase()];
}

/**
 * Run order first, which also puts Now before Next before Later, then the
 * later run's groups, then the most recently updated. The repo-then-number
 * tiebreak keeps rows that share a timestamp from reshuffling between sweeps.
 */
export function sortIssues(rows: ListedIssue[], inputs: TierInputs): ListedIssue[] {
  const order = new Map(ISSUE_RUNS.map((run, index) => [run.id, index]));
  const keyed = rows.map((row) => {
    const run = runOf(row, inputs);
    return { row, run: order.get(run) ?? ISSUE_RUNS.length, rank: run === "later" ? laterRank(row, inputs) : null };
  });
  keyed.sort((a, b) => {
    if (a.run !== b.run) return a.run - b.run;
    if (a.rank && b.rank) {
      if (a.rank[0] !== b.rank[0]) return a.rank[0] - b.rank[0];
      if (a.rank[1] !== b.rank[1]) return a.rank[1] - b.rank[1];
      const byName = a.rank[2].localeCompare(b.rank[2]);
      if (byName !== 0) return byName;
    }
    return (
      b.row.updatedAt - a.row.updatedAt ||
      a.row.repo.localeCompare(b.row.repo) ||
      a.row.number - b.row.number
    );
  });
  return keyed.map((entry) => entry.row);
}

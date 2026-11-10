/**
 * A pull request's checks on its head commit, read the same way by every
 * plugin: one entry per check, from its latest run.
 *
 * GitHub returns checks in two forms. `gh pr view --json statusCheckRollup`
 * and `gh pr list` give a flat CheckRun with `workflowName`; a GraphQL
 * `statusCheckRollup.contexts` node nests the workflow under `checkSuite`.
 * Either can hold a StatusContext, which has only a `state` and names itself
 * in `context`.
 *
 * A re-run does not replace its predecessor: GitHub returns both runs, and
 * GitHub's own counts by state include both. So a check a newer push
 * cancelled and a re-run passed would count as cancelled, and a failure fixed
 * by a re-run would count as failing. Only the latest run of each name counts.
 */

export interface RollupEntry {
  __typename?: string;
  name?: string | null;
  /** A StatusContext names itself here rather than in `name`. */
  context?: string | null;
  status?: string | null;
  conclusion?: string | null;
  state?: string | null;
  /** Which run of a re-run check this is. */
  startedAt?: string | null;
  /** `gh`'s flat form. */
  workflowName?: string | null;
  /** GraphQL's nested form. */
  checkSuite?: { workflowRun?: { workflow?: { name?: string | null } | null } | null } | null;
  /** A CheckRun's details page. */
  detailsUrl?: string | null;
  /** A StatusContext's details page. */
  targetUrl?: string | null;
}

export type CheckOutcome = "fail" | "cancelled" | "pending" | "pass" | "skip";

/** One check, as the checks menu lists it. */
export interface CheckEntry {
  name: string;
  /** The Actions workflow it belongs to, when it has one. */
  workflow?: string;
  outcome: CheckOutcome;
  /** Its details page on GitHub or the CI provider. */
  url?: string;
}

/** The checks counted by outcome. `total` is every check, skipped ones included. */
export interface CheckCounts {
  pass: number;
  fail: number;
  skip: number;
  pending: number;
  cancelled: number;
  total: number;
}

const SKIPPED = new Set(["SKIPPED", "NEUTRAL", "STALE"]);
const FAILED = new Set(["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);

type Rollup = ReadonlyArray<RollupEntry | null | undefined> | null | undefined;

function checkName(entry: RollupEntry): string {
  return (entry.name ?? entry.context ?? "").trim();
}

function startedAt(entry: RollupEntry): number {
  const at = Date.parse(entry.startedAt ?? "");
  return Number.isNaN(at) ? -Infinity : at;
}

/**
 * One entry per check, the latest run of each, in the order each check first
 * appears. Keyed on the check's name; an entry with no name cannot be matched
 * against anything, so it is kept on its own. An undated run loses to a dated
 * one, and of two runs with the same date the later in the list wins.
 */
export function latestChecks<T extends RollupEntry>(rollup: ReadonlyArray<T | null | undefined> | null | undefined): T[] {
  const latest = new Map<string, T>();
  let anonymous = 0;
  for (const entry of rollup ?? []) {
    if (!entry) continue;
    const key = checkName(entry);
    if (key === "") {
      latest.set(`\u0000${anonymous++}`, entry);
      continue;
    }
    const current = latest.get(key);
    if (!current || startedAt(entry) >= startedAt(current)) latest.set(key, entry);
  }
  return [...latest.values()];
}

/**
 * A run's outcome. A StatusContext has no `status`, only a `state`; a CheckRun
 * that has not completed has no meaningful conclusion yet. A state or
 * conclusion this does not know counts as still running, never as a pass.
 */
export function checkOutcome(entry: RollupEntry): CheckOutcome {
  if (entry.__typename === "StatusContext" || ((entry.status ?? undefined) === undefined && entry.state != null)) {
    const state = (entry.state ?? "").toUpperCase();
    if (state === "SUCCESS") return "pass";
    if (state === "PENDING" || state === "EXPECTED") return "pending";
    return "fail";
  }
  if ((entry.status ?? "").toUpperCase() !== "COMPLETED") return "pending";
  const conclusion = (entry.conclusion ?? "").toUpperCase();
  if (conclusion === "SUCCESS") return "pass";
  if (SKIPPED.has(conclusion)) return "skip";
  if (conclusion === "CANCELLED") return "cancelled";
  if (FAILED.has(conclusion)) return "fail";
  return "pending";
}

/** Every check's latest run, with its workflow and details page. */
export function checkEntries(rollup: Rollup): CheckEntry[] {
  return latestChecks(rollup).map((entry) => {
    const check: CheckEntry = { name: checkName(entry) || "Unnamed check", outcome: checkOutcome(entry) };
    const workflow = entry.workflowName || entry.checkSuite?.workflowRun?.workflow?.name;
    if (workflow) check.workflow = workflow;
    const url = entry.detailsUrl || entry.targetUrl;
    if (url) check.url = url;
    return check;
  });
}

/** The checks counted by outcome. */
export function countChecks(entries: readonly CheckEntry[]): CheckCounts {
  const counts: CheckCounts = { pass: 0, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 0 };
  for (const entry of entries) {
    counts[entry.outcome] += 1;
    counts.total += 1;
  }
  return counts;
}

/** The names of the failing checks, sorted, nameless ones left out. */
export function failingCheckNames(rollup: Rollup): string[] {
  return latestChecks(rollup)
    .filter((entry) => checkOutcome(entry) === "fail")
    .map(checkName)
    .filter((name) => name !== "")
    .sort();
}

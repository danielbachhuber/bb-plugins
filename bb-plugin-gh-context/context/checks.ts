/**
 * A pull request's checks, counted the way bb counts them for a thread's own
 * branch, so a linked pull request and a checked-out one read the same.
 *
 * `gh pr view --json statusCheckRollup` mixes two shapes: a CheckRun has a
 * `status` and, once completed, a `conclusion`; a StatusContext has only a
 * `state`. A re-run check appears once per run, so only the latest run of each
 * name counts, or a failure fixed by a re-run would still read as failing.
 */

export interface RollupEntry {
  name?: unknown;
  context?: unknown;
  status?: unknown;
  conclusion?: unknown;
  state?: unknown;
  startedAt?: unknown;
}

export interface Checks {
  state: "passing" | "failing" | "pending" | "unknown" | "no_checks";
  totalCount: number;
  passedCount: number;
  failedCount: number;
  pendingCount: number;
}

const PASSED = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const FAILED = new Set([
  "FAILURE",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
  "ERROR",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function startedAt(entry: RollupEntry): number {
  const at = Date.parse(text(entry.startedAt));
  return Number.isNaN(at) ? -Infinity : at;
}

type Outcome = "passed" | "failed" | "pending" | "unknown";

function outcome(entry: RollupEntry): Outcome {
  // StatusContext: no status, only state.
  if (entry.status === undefined && entry.state !== undefined) {
    const state = text(entry.state).toUpperCase();
    if (state === "SUCCESS") return "passed";
    if (state === "PENDING" || state === "EXPECTED") return "pending";
    return FAILED.has(state) ? "failed" : "unknown";
  }
  if (text(entry.status).toUpperCase() !== "COMPLETED") return "pending";
  const conclusion = text(entry.conclusion).toUpperCase();
  if (PASSED.has(conclusion)) return "passed";
  if (FAILED.has(conclusion)) return "failed";
  return "unknown";
}

export function summarizeChecks(rollup: readonly RollupEntry[] | null | undefined): Checks {
  const latest = new Map<string, RollupEntry>();
  let anonymous = 0;
  for (const entry of rollup ?? []) {
    const key = (text(entry.name) || text(entry.context)).trim();
    if (key === "") {
      latest.set(`\u0000${anonymous++}`, entry);
      continue;
    }
    const current = latest.get(key);
    if (!current || startedAt(entry) >= startedAt(current)) latest.set(key, entry);
  }

  const counts: Record<Outcome, number> = { passed: 0, failed: 0, pending: 0, unknown: 0 };
  for (const entry of latest.values()) counts[outcome(entry)] += 1;

  const state: Checks["state"] =
    latest.size === 0
      ? "no_checks"
      : counts.failed > 0
        ? "failing"
        : counts.pending > 0
          ? "pending"
          : counts.unknown > 0
            ? "unknown"
            : "passing";

  return {
    state,
    totalCount: latest.size,
    passedCount: counts.passed,
    failedCount: counts.failed,
    pendingCount: counts.pending,
  };
}

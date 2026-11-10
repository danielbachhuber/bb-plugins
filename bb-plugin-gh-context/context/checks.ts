/**
 * A pull request's checks in bb's own shape, so a linked pull request and a
 * checked-out one read the same. The reading itself, one entry per check from
 * its latest run, lives in gh-shared, which PR Sweep and Review Sweep share.
 */
import { checkEntries, countChecks, type RollupEntry } from "@danielb/gh-shared/gh";

export { checkEntries, type RollupEntry };

export interface Checks {
  state: "passing" | "failing" | "pending" | "unknown" | "no_checks";
  totalCount: number;
  passedCount: number;
  failedCount: number;
  pendingCount: number;
}

/** bb counts a skipped check as passed and a cancelled one as failed. */
export function summarizeChecks(rollup: readonly RollupEntry[] | null | undefined): Checks {
  const counts = countChecks(checkEntries(rollup));
  const passed = counts.pass + counts.skip;
  const failed = counts.fail + counts.cancelled;
  return {
    state: counts.total === 0 ? "no_checks" : failed > 0 ? "failing" : counts.pending > 0 ? "pending" : "passing",
    totalCount: counts.total,
    passedCount: passed,
    failedCount: failed,
    pendingCount: counts.pending,
  };
}

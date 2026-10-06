import { FLAG_SEVERITY, groupForFlags, type ClassifiedRow, type Flag } from "./types.js";

/**
 * Dismissing a pull request's failing checks, for a failure the author cannot
 * fix, such as a check that waits on a label only a maintainer can add.
 *
 * A dismissal is recorded against the head commit and the names of the checks
 * failing on it. A new push, or a different check failing, no longer matches,
 * so the flag comes back on its own rather than staying hidden for good.
 */

/**
 * What a dismissal of this row's failing checks is recorded as, or null when
 * there is nothing to dismiss: no failing checks, or a row stored before the
 * sweep read the head commit and the check names.
 */
export function checksFingerprint(row: ClassifiedRow): string | null {
  if (!row.flags.includes("ci-failing")) return null;
  if (!row.headSha || !row.failingChecks || row.failingChecks.length === 0) return null;
  return `${row.headSha}:${[...row.failingChecks].sort().join("\n")}`;
}

/**
 * The row as the panel and a spawned thread should see it. When the stored
 * dismissal still matches, the failing-checks flag is gone and the row says
 * which checks it dismissed. Otherwise the row is returned unchanged.
 */
export function applyDismissal(row: ClassifiedRow, fingerprint: string | undefined): ClassifiedRow {
  if (fingerprint === undefined || checksFingerprint(row) !== fingerprint) return row;
  const flags = FLAG_SEVERITY.filter((flag: Flag) => flag !== "ci-failing" && row.flags.includes(flag));
  return { ...row, flags, group: groupForFlags(flags), dismissedChecks: row.failingChecks };
}

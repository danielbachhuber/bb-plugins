// The issues closed in each bucket of a period: those completed, split by
// issue type, and those closed as not planned or as a duplicate, which close
// an issue without the work it asked for.
import type { Issue } from "../mirror/github.js";
import { bucketIndex, type Bucket } from "../dashboard/period.js";

export interface ClosedIssues {
  /**
   * Completed issues in each bucket, a row per issue type: the organization's
   * types busiest first, then `null` for issues with no type. Only types with
   * a completed issue in the period appear.
   */
  types: Array<{ name: string | null; completed: number[] }>;
  notPlanned: number[];
  duplicate: number[];
}

/**
 * Each issue closed in the period, in the bucket it closed in. One mirrored
 * before the sync asked why issues close counts as completed, and one without
 * a type as No type, until the backfill gives it both.
 */
export function closedIssues(issues: readonly Issue[], buckets: readonly Bucket[]): ClosedIssues {
  const zeros = () => buckets.map(() => 0);
  const byType = new Map<string | null, number[]>();
  const notPlanned = zeros();
  const duplicate = zeros();
  for (const issue of issues) {
    if (issue.state !== "CLOSED" || issue.closedAt === null) continue;
    const i = bucketIndex(buckets, Date.parse(issue.closedAt));
    if (i === -1) continue;
    if (issue.stateReason === "NOT_PLANNED") notPlanned[i] += 1;
    else if (issue.stateReason === "DUPLICATE") duplicate[i] += 1;
    else {
      const name = issue.issueType?.name ?? null;
      const row = byType.get(name) ?? zeros();
      row[i] += 1;
      byType.set(name, row);
    }
  }
  const total = (row: number[]) => row.reduce((sum, count) => sum + count, 0);
  const types = [...byType]
    .map(([name, completed]) => ({ name, completed }))
    .sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : total(b.completed) - total(a.completed) || a.name.localeCompare(b.name)));
  return { types, notPlanned, duplicate };
}

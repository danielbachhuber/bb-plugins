/**
 * The workstream table as plain text, for `bb weekly-review table`, for the
 * digest an agent reads, and for the Unsorted list an agent proposes rules
 * from.
 */
import { formatDayShort } from "./dates.js";
import type { Cell, TableRow, WorkstreamTable } from "./workstreams.js";

/** `2.5h · 2 PRs · 1 review`, or `—` for an empty cell. */
export function describeCell(cell: Cell): string {
  const parts: string[] = [];
  if (cell.hours > 0) parts.push(`${cell.hours.toFixed(2).replace(/\.?0+$/, "")}h`);
  const { pr, review, issue, task } = cell.counts;
  if (pr > 0) parts.push(`${pr} PR${pr === 1 ? "" : "s"}`);
  if (review > 0) parts.push(`${review} review${review === 1 ? "" : "s"}`);
  if (issue > 0) parts.push(`${issue} issue${issue === 1 ? "" : "s"}`);
  if (task > 0) parts.push(`${task} task${task === 1 ? "" : "s"}`);
  return parts.length === 0 ? "—" : parts.join(" · ");
}

export function tableText(table: WorkstreamTable): string {
  const rows = [...table.rows, table.unsorted].filter(
    (row) => row.total.keys.length > 0 || row.added,
  );
  if (rows.length === 0) return "Nothing happened this week.";
  return rows.map((row) => rowText(row, table.days)).join("\n\n");
}

function rowText(row: TableRow, days: string[]): string {
  const share = row.share === null ? "" : `, ${Math.round(row.share * 100)}% of the hours`;
  const lines = [`${row.name}: ${describeCell(row.total)}${share}${row.added ? " (added)" : ""}`];
  for (const day of days) {
    const cell = row.cells[day];
    if (cell.keys.length > 0) lines.push(`  ${formatDayShort(day)}  ${describeCell(cell)}`);
  }
  return lines.join("\n");
}

/** Every Unsorted activity with the fields a rule could match on. */
export function unsortedText(table: WorkstreamTable): string {
  const keys = table.unsorted.total.keys;
  if (keys.length === 0) return "Nothing is unsorted.";
  return keys
    .map((key) => table.activities[key])
    .map((item) => {
      const facts = [
        item.day ?? "no day",
        item.type,
        item.hours > 0 ? `${item.hours}h` : null,
        item.ref === null ? null : `#${item.ref}`,
        item.task === null ? null : `task: ${item.task}`,
        item.labels.length === 0 ? null : `labels: ${item.labels.join(", ")}`,
      ].filter((fact) => fact !== null);
      return `${item.key}  ${facts.join("  ")}  ${item.title}`;
    })
    .join("\n");
}

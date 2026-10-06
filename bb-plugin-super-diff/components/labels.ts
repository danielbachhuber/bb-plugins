// The panel's small pieces of text. Pure.
import type { ReviewView, ViewFile } from "@/review/contract";
import { hashText } from "@/review/items";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function list(words: string[]): string {
  if (words.length <= 2) return words.join(" and ");
  return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
}

/** "hunks 1 and 3 of 4" when a concern holds only some of a file's hunks. */
export function hunkNote(file: ViewFile): string | null {
  const shown = file.hunks.filter((h) => h.status !== "removed" && h.kind === "hunk").map((h) => h.index + 1);
  if (shown.length === 0 || shown.length >= file.total) return null;
  return `${shown.length === 1 ? "hunk" : "hunks"} ${list(shown.map(String))} of ${file.total}`;
}

export function staleLabel(commitsSince: number | null, files: number): string {
  const fileText = plural(files, "file", "files");
  if (commitsSince === null) return `the branch was rewritten, and ${fileText} changed since`;
  if (commitsSince === 0) return `${fileText} changed since`;
  return `${plural(commitsSince, "commit", "commits")} and ${fileText} changed since`;
}

export function coverageLabel(coverage: ReviewView["coverage"]): string {
  const files = plural(coverage.files, "file", "files");
  const against = coverage.base ? `, against ${coverage.base}` : "";
  if (coverage.shown === coverage.hunks) return `${files}, ${plural(coverage.hunks, "hunk", "hunks")}, all shown${against}`;
  return `${files}, ${coverage.shown} of ${plural(coverage.hunks, "hunk", "hunks")} shown${against}`;
}

/** Lines a file's shown hunks add and remove. */
export function fileStats(file: ViewFile): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of file.hunks) {
    if (hunk.status === "removed") continue;
    for (const line of hunk.text.split("\n").slice(1)) {
      if (line.startsWith("+")) added++;
      else if (line.startsWith("-")) removed++;
    }
  }
  return { added, removed };
}

export function viewedLabel(coverage: ReviewView["coverage"]): string {
  return `${coverage.viewed} of ${plural(coverage.files, "file", "files")} viewed`;
}

/** "3 scenarios · 3 asserted, 3 snapshot only · 3 not covered" */
export function testsLabel(tests: { scenarios: number; asserted: number; snapshotOnly: number; gaps: number }): string {
  return `${plural(tests.scenarios, "scenario", "scenarios")} · ${tests.asserted} asserted, ${tests.snapshotOnly} snapshot only · ${tests.gaps} not covered`;
}

/**
 * A path for bb's source viewer that changes whenever the text does. The
 * viewer caches a file's lines by path for the whole session, so showing new
 * text under an old path, after a regrouping or on another scenario, crashed
 * it with "Line doesnt exist".
 */
export function sourcePath(name: string, content: string): string {
  return `${name}-${hashText(content)}.feature`;
}

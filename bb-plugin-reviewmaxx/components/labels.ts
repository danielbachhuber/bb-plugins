// The panel's small pieces of text. Pure.
import type { ReviewView, ViewFile } from "@/review/contract";

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
  if (coverage.shown === coverage.hunks) return `${files}, ${plural(coverage.hunks, "hunk", "hunks")}, all shown`;
  return `${files}, ${coverage.shown} of ${plural(coverage.hunks, "hunk", "hunks")} shown`;
}

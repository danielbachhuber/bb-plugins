// The data half of `verify`: is every item shown exactly once? Pure.
import type { ReviewView } from "./contract";
import { itemKey, type Item } from "./types";

export interface CoverageReport {
  files: number;
  hunks: number;
  /** Paths git lists as changed that the parsed diff has no file for. */
  missingPaths: string[];
  missing: string[];
  twice: string[];
  /** Shown keys that are not items, which would mean the view invented one. */
  extra: string[];
}

/** Every non-removed hunk in the view as `path#index`, once per appearance. */
export function shownKeys(view: ReviewView): string[] {
  const sections = [...view.concerns, view.notYetGrouped, view.mechanical].filter((s) => s !== null);
  return sections.flatMap((s) =>
    s.files.flatMap((f) => f.hunks.filter((h) => h.status !== "removed").map((h) => itemKey(h.path, h.index))),
  );
}

export function checkCoverage(expectedPaths: string[], items: Item[], shown: string[]): CoverageReport {
  const itemPaths = new Set(items.map((item) => item.path));
  const counts = new Map<string, number>();
  for (const key of shown) counts.set(key, (counts.get(key) ?? 0) + 1);
  const keys = items.map((item) => itemKey(item.path, item.index));
  const known = new Set(keys);
  return {
    files: new Set([...expectedPaths, ...itemPaths]).size,
    hunks: items.length,
    missingPaths: [...new Set(expectedPaths)].filter((path) => !itemPaths.has(path)).sort(),
    missing: keys.filter((key) => !counts.has(key)),
    twice: keys.filter((key) => (counts.get(key) ?? 0) > 1),
    extra: [...counts.keys()].filter((key) => !known.has(key)),
  };
}

export function formatCoverage(report: CoverageReport): { ok: boolean; text: string } {
  const once = report.hunks - report.missing.length - report.twice.length;
  const lines = [
    `${report.files} files, ${report.hunks} hunks: ${once} shown once, ${report.missing.length} missing, ${report.twice.length} twice.`,
    ...report.missingPaths.map((path) => `not in the parsed diff: ${path}`),
    ...report.missing.map((key) => `missing: ${key}`),
    ...report.twice.map((key) => `twice: ${key}`),
    ...report.extra.map((key) => `not in the diff: ${key}`),
  ];
  return { ok: lines.length === 1, text: lines.join("\n") };
}

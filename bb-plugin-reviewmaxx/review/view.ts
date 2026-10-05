// From the current diff and the stored grouping to what the panel draws. Pure.
//
// Every current item lands in exactly one section: its concern, Mechanical, or
// Not yet grouped. Items the grouping placed but the diff no longer has are
// shown in their concern as removed, and not counted.
import { isMechanical } from "./classify";
import type { ReviewView, StaleInfo, ViewFile, ViewHunk, ViewSection } from "./contract";
import type { Grouping } from "./grouping";
import { itemsOf } from "./items";
import { itemKey, type Assignment, type DiffFile, type Item } from "./types";

export interface StoredGrouping {
  grouping: Grouping;
  assignments: Assignment[];
  baseSha: string;
  headSha: string;
  groupedAt: string;
}

type Placement = { concern: number; status: "current" | "changed" };

/**
 * Match current items to stored assignments. First by path and content hash,
 * so a hunk that only moved keeps its concern; then by path and index, so an
 * edited hunk keeps its concern and is marked changed. Whatever is left over
 * on the stored side was removed.
 */
export function placeItems(items: Item[], assignments: Assignment[]): { placed: Map<string, Placement>; removed: Assignment[] } {
  const used = new Set<number>();
  const placed = new Map<string, Placement>();
  const byHash = new Map<string, number[]>();
  assignments.forEach((a, i) => {
    const key = `${a.path}\0${a.hash}`;
    byHash.set(key, [...(byHash.get(key) ?? []), i]);
  });

  const unmatched: Item[] = [];
  for (const item of items) {
    const hit = (byHash.get(`${item.path}\0${item.hash}`) ?? []).find((i) => !used.has(i));
    if (hit === undefined) {
      unmatched.push(item);
      continue;
    }
    used.add(hit);
    placed.set(itemKey(item.path, item.index), { concern: assignments[hit]!.concern, status: "current" });
  }
  for (const item of unmatched) {
    const hit = assignments.findIndex((a, i) => !used.has(i) && a.path === item.path && a.index === item.index);
    if (hit === -1) continue;
    used.add(hit);
    placed.set(itemKey(item.path, item.index), { concern: assignments[hit]!.concern, status: "changed" });
  }
  return { placed, removed: assignments.filter((_, i) => !used.has(i)) };
}

export function buildView(files: DiffFile[], stored: StoredGrouping | null, stale: StaleInfo | null): ReviewView {
  const items = itemsOf(files);
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const { placed, removed } = stored ? placeItems(items, stored.assignments) : { placed: new Map<string, Placement>(), removed: [] };

  const buckets = new Map<string, ViewHunk[]>();
  const put = (section: string, hunk: ViewHunk) => buckets.set(section, [...(buckets.get(section) ?? []), hunk]);

  for (const item of items) {
    const placement = placed.get(itemKey(item.path, item.index));
    const section = placement ? `concern-${placement.concern}` : isMechanical(item.path) ? "mechanical" : "not-yet-grouped";
    const hunk = fileByPath.get(item.path)!.hunks[item.index];
    put(section, {
      path: item.path,
      index: item.index,
      kind: item.kind,
      header: hunk?.header ?? "",
      text: hunk?.text ?? "",
      status: placement?.status ?? "current",
    });
  }
  for (const a of removed) {
    put(`concern-${a.concern}`, { path: a.path, index: a.index, kind: "hunk", header: "", text: "", status: "removed" });
  }

  const section = (id: string, title: string, note: string | null): ViewSection | null => {
    const hunks = buckets.get(id);
    return hunks?.length ? { id, title, note, files: byFile(hunks, fileByPath) } : null;
  };

  const shown = [...buckets.values()].flat().filter((hunk) => hunk.status !== "removed").length;
  return {
    headline: stored?.grouping.headline ?? null,
    concerns: (stored?.grouping.concerns ?? [])
      .map((concern, ci) => section(`concern-${ci}`, concern.title, concern.note))
      .filter((s): s is ViewSection => s !== null),
    notYetGrouped: section("not-yet-grouped", "Not yet grouped", null),
    mechanical: section("mechanical", "Mechanical", "Lockfiles, snapshots, and generated files."),
    stale,
    coverage: { files: files.length, hunks: items.length, shown },
  };
}

/** Group a section's hunks by file, files in first-seen order, hunks by index. */
function byFile(hunks: ViewHunk[], fileByPath: Map<string, DiffFile>): ViewFile[] {
  const order: string[] = [];
  const grouped = new Map<string, ViewHunk[]>();
  for (const hunk of hunks) {
    if (!grouped.has(hunk.path)) order.push(hunk.path);
    grouped.set(hunk.path, [...(grouped.get(hunk.path) ?? []), hunk]);
  }
  return order.map((path) => {
    const file = fileByPath.get(path);
    return {
      path,
      previousPath: file?.previousPath ?? null,
      fileStatus: file?.status ?? "deleted",
      binary: file?.binary ?? false,
      header: file?.header ?? "",
      total: file ? Math.max(file.hunks.length, 1) : 0,
      hunks: grouped.get(path)!.sort((a, b) => a.index - b.index),
    };
  });
}

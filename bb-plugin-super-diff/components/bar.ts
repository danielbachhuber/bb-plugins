// How the bar under the headline groups the branch's files. Pure.
import type { BarFile } from "@/review/contract";

/** The narrowest a file's segment may be before the bar groups files by directory. */
export const MIN_GROUP_PX = 56;
/** The narrowest a label may be before it is left off, with its name on hover. */
export const MIN_LABEL_PX = 40;
/** The narrowest a hunk's block may be before its file fills as one segment. */
export const MIN_HUNK_PX = 4;

export interface BarGroup {
  /** The file's name, or the directory's path with its trailing slash. */
  label: string;
  /** The whole path, for hover. */
  title: string;
  files: BarFile[];
  /** Lines changed across the group's hunks: its width. */
  lines: number;
}

export const linesOf = (file: BarFile) => file.hunks.reduce((n, hunk) => n + hunk.lines, 0);

const dirOf = (path: string, depth: number) => {
  const parts = path.split("/").slice(0, -1);
  return parts.length === 0 ? "./" : `${parts.slice(0, depth).join("/")}/`;
};

/**
 * One group per file while each would be at least MIN_GROUP_PX wide on
 * average; past that, one per directory, using the deepest directories that
 * still fit and shorter ones when they do not. In the order the diff lists them.
 *
 * @param width the bar's width in pixels
 */
export function barGroups(files: BarFile[], width: number): { byDirectory: boolean; groups: BarGroup[] } {
  const room = Math.max(1, Math.floor(width / MIN_GROUP_PX));
  if (files.length <= room) {
    return {
      byDirectory: false,
      groups: files.map((file) => ({ label: file.path.slice(file.path.lastIndexOf("/") + 1), title: file.path, files: [file], lines: linesOf(file) })),
    };
  }
  const deepest = Math.max(1, ...files.map((file) => file.path.split("/").length - 1));
  let groups: BarGroup[] = [];
  for (let depth = deepest; depth >= 1; depth--) {
    const byDir = new Map<string, BarGroup>();
    for (const file of files) {
      const dir = dirOf(file.path, depth);
      const group = byDir.get(dir) ?? { label: dir, title: dir, files: [], lines: 0 };
      group.files.push(file);
      group.lines += linesOf(file);
      byDir.set(dir, group);
    }
    groups = [...byDir.values()];
    if (groups.length <= room) break;
  }
  return { byDirectory: true, groups };
}

/** The share of a file's changed lines that are read, from 0 to 1. */
export function readShare(file: BarFile): number {
  const total = linesOf(file);
  return total === 0 ? 0 : file.hunks.filter((hunk) => hunk.read).reduce((n, hunk) => n + hunk.lines, 0) / total;
}

/** The section to open for a file: where its first unread hunk is, or its first hunk. */
export function sectionFor(file: BarFile): string | null {
  return (file.hunks.find((hunk) => !hunk.read) ?? file.hunks[0])?.section ?? null;
}

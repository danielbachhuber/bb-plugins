// Reading per hunk, kept in step with a per-file Viewed kept somewhere else:
// GitHub's on the thread's pull request, or, with no pull request, the Viewed
// boxes the Diff Viewed plugin puts in bb's changes panel. Pure; pull-request.ts
// talks to GitHub and server.ts to Diff Viewed.
//
// A file syncs with GitHub only while its diff here is the pull request's,
// judged by its `+a −d` counts. Then GitHub's Viewed is the file's state:
// VIEWED reads every hunk, and a change that reads or unreads the whole file is
// sent there. Otherwise, with unpushed edits, the local hunk marks are all
// there is and GitHub is left alone. The changes panel shows every file, so
// every file syncs with it; a mark there counts while its counts are the file's.
import { itemKey } from "./types";

/** One file of the pull request as GitHub reports it for the viewer, or one file the changes panel has marked. */
export interface GithubFile {
  path: string;
  additions: number;
  deletions: number;
  /** VIEWED. UNVIEWED and DISMISSED (changed since viewed) are false. */
  viewed: boolean;
}

export type Sync = "synced" | "local" | "none";

/** Where a file's Viewed is kept, other than here. */
export type ViewedWhere = "github" | "changes-panel";

/** The other place's files by path: all of a pull request's, or the ones the changes panel has marked. */
export interface ViewedSource {
  where: ViewedWhere;
  files: Map<string, GithubFile>;
}

const sameCounts = (counts: { added: number; removed: number }, file: GithubFile) => file.additions === counts.added && file.deletions === counts.removed;

/**
 * @param counts the lines this file's diff here adds and removes
 * @param entry the other place's entry for the same path
 * @param where the place, or null when there is none to sync with
 */
export function syncOf(counts: { added: number; removed: number }, entry: GithubFile | undefined, where: ViewedWhere | null): Sync {
  if (where === null) return "none";
  if (where === "changes-panel") return "synced";
  if (!entry || !sameCounts(counts, entry)) return "local";
  return "synced";
}

/** Whether the other place shows this file Viewed, for the diff it has now. */
export function viewedThere(counts: { added: number; removed: number }, entry: GithubFile | undefined, where: ViewedWhere | null): boolean {
  if (where === null || !entry?.viewed) return false;
  return sameCounts(counts, entry);
}

export interface Item {
  path: string;
  index: number;
  hash: string;
}

/** What deciding a file's reads needs: every item of the file, wherever it is shown. */
export interface FileContext {
  items: Item[];
  /** Local marks, `path#index` to the hash they were set at. */
  marks: Map<string, string>;
  sync: Sync;
  /** The other place, GitHub or the changes panel, shows the file Viewed. */
  githubViewed: boolean;
}

export function isRead(file: FileContext, item: Item): boolean {
  if (file.sync === "synced" && file.githubViewed) return true;
  return file.marks.get(itemKey(item.path, item.index)) === item.hash;
}

export interface Plan {
  /** Items to mark read locally, at their current hashes. */
  set: Item[];
  /** Items whose local marks to clear. */
  clear: Item[];
  github: "mark" | "unmark" | null;
}

/** Mark some of a file's hunks read or unread. */
export function planRead(file: FileContext, indexes: number[], read: boolean): Plan {
  const chosen = file.items.filter((item) => indexes.includes(item.index));
  const synced = file.sync === "synced";
  if (read) {
    const allRead = file.items.every((item) => chosen.includes(item) || isRead(file, item));
    return { set: chosen, clear: [], github: synced && !file.githubViewed && allRead ? "mark" : null };
  }
  if (synced && file.githubViewed) {
    // GitHub read the whole file; keep the rest read here before unmarking it there.
    return { set: file.items.filter((item) => !chosen.includes(item)), clear: chosen, github: "unmark" };
  }
  return { set: [], clear: chosen, github: null };
}

/** Check or uncheck the file's Viewed box: every hunk of the file, in every concern. */
export function planFileViewed(file: FileContext, viewed: boolean): Plan {
  const github = file.sync === "synced" ? (viewed ? "mark" : "unmark") : null;
  return viewed ? { set: file.items, clear: [], github } : { set: [], clear: file.items, github };
}

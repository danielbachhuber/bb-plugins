// Reading per hunk, kept in step with GitHub's per-file Viewed on the thread's
// pull request. Pure; pull-request.ts talks to GitHub.
//
// A file syncs only while its diff here is the pull request's, judged by its
// `+a −d` counts. Then GitHub's Viewed is the file's state: VIEWED reads every
// hunk, and a change that reads or unreads the whole file is sent there.
// Otherwise, with unpushed edits or no pull request, the local hunk marks are
// all there is and GitHub is left alone.
import { itemKey } from "./types";

/** One file of the pull request, as GitHub reports it for the viewer. */
export interface GithubFile {
  path: string;
  additions: number;
  deletions: number;
  /** VIEWED. UNVIEWED and DISMISSED (changed since viewed) are false. */
  viewed: boolean;
}

export type Sync = "synced" | "local" | "none";

/**
 * @param counts the lines this file's diff here adds and removes
 * @param github the pull request's entry for the same path
 * @param hasPullRequest whether the thread has an open pull request that answered
 */
export function syncOf(counts: { added: number; removed: number }, github: GithubFile | undefined, hasPullRequest: boolean): Sync {
  if (!hasPullRequest) return "none";
  if (!github || github.additions !== counts.added || github.deletions !== counts.removed) return "local";
  return "synced";
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
  /** GitHub shows the file VIEWED. */
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

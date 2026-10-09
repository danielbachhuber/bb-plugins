// Pure rules for syncing marks with GitHub's own per-file Viewed state on a
// pull request. No network: the server fetches the pull request's files and
// hands them here, and the content script uses the same rules to decide what
// each checkbox shows.
//
// The rule is one comparison. GitHub reports each file's `+a -d` counts, which
// is the same fingerprint a local mark is keyed on. When the counts match, the
// diff on screen is the one on GitHub, so GitHub's state is the mark and a
// click writes through to it. When they differ, as with unpushed edits or the
// Uncommitted range, GitHub's state is about a different diff, so only the
// local mark counts and GitHub is left alone.
import {
  fingerprintFromCounts,
  labelForEntry,
  type DiffFileEntry,
  type FileMarkTarget,
  type ReviewProgress,
  type ViewedRecord,
} from "./marks";

/** One file of the pull request, as GitHub reports it for the viewer. */
export interface GithubFile {
  path: string;
  additions: number;
  deletions: number;
  /** GitHub's VIEWED. UNVIEWED and DISMISSED (changed since viewed) are false. */
  viewed: boolean;
}

/** The thread's pull request and its files, or null when nothing syncs. */
export interface GithubState {
  number: number;
  url: string;
  files: GithubFile[];
}

/** Where a file's mark lives. */
export type SyncMode =
  /** No pull request, or sync is off: the plugin behaves as it always has. */
  | { kind: "none" }
  /** The diff matches GitHub's, so the mark is GitHub's Viewed box. */
  | { kind: "synced"; number: number; file: GithubFile }
  /** There is a pull request, but this diff is not the one on GitHub. */
  | { kind: "local"; number: number };

/**
 * The path GitHub knows a file by. bb labels a rename `previous -> current`;
 * GitHub lists it under the current path.
 */
export function githubPath(label: string): string {
  const arrow = label.lastIndexOf(" -> ");
  return arrow === -1 ? label : label.slice(arrow + 4);
}

/**
 * Whether a local fingerprint describes the same diff as GitHub's counts. A
 * binary file's header shows a size instead of counts, so its fingerprint is
 * `none`, and GitHub reports it as `+0 -0`.
 */
export function sameDiff(file: GithubFile, fingerprint: string): boolean {
  if (fingerprint === "none") return file.additions === 0 && file.deletions === 0;
  return fingerprint === fingerprintFromCounts(file);
}

export function syncMode(
  github: GithubState | null,
  target: FileMarkTarget,
): SyncMode {
  if (github === null) return { kind: "none" };
  const path = githubPath(target.path);
  const file = github.files.find((candidate) => candidate.path === path);
  if (file !== undefined && sameDiff(file, target.fingerprint)) {
    return { kind: "synced", number: github.number, file };
  }
  return { kind: "local", number: github.number };
}

/** Whether this exact diff of this file counts as viewed. */
export function isMarked(
  record: ViewedRecord,
  github: GithubState | null,
  target: FileMarkTarget,
): boolean {
  const mode = syncMode(github, target);
  if (mode.kind === "synced") return mode.file.viewed;
  return record[target.path] === target.fingerprint;
}

/**
 * Count the files in `entries` whose current diff counts as viewed. A binary
 * image's header shows its size rather than counts, so its local mark was
 * stored as `none` and is counted on that.
 */
export function syncedProgress(
  record: ViewedRecord,
  github: GithubState | null,
  entries: readonly DiffFileEntry[],
): ReviewProgress {
  let viewed = 0;
  for (const entry of entries) {
    const target = { path: labelForEntry(entry), fingerprint: fingerprintFromCounts(entry) };
    const mode = syncMode(github, target);
    const marked =
      mode.kind === "synced"
        ? mode.file.viewed
        : record[target.path] === target.fingerprint ||
          (entry.binary && record[target.path] === "none");
    if (marked) viewed += 1;
  }
  return { viewed, total: entries.length };
}

/** Replace one file's Viewed state, returning a new state. */
export function withGithubViewed(
  github: GithubState,
  path: string,
  viewed: boolean,
): GithubState {
  return {
    ...github,
    files: github.files.map((file) =>
      file.path === path ? { ...file, viewed } : file,
    ),
  };
}

/** Storage key for one thread's marks that have yet to reach GitHub. */
export function pendingKey(threadId: string): string {
  return `pending:${threadId}`;
}

/**
 * Add or drop a path in the list of marks waiting for GitHub. Returns the
 * input when nothing changed, so the caller can skip the write.
 */
export function withPending(
  pending: readonly string[],
  path: string,
  waiting: boolean,
): readonly string[] {
  const has = pending.includes(path);
  if (has === waiting) return pending;
  return waiting ? [...pending, path] : pending.filter((entry) => entry !== path);
}

/**
 * Which marks made in bb to send to GitHub now. `pending` lists the files
 * marked while their mark could not reach GitHub: before the thread had a pull
 * request, or while the diff differed from the pull request's. Once a file's
 * marked diff is the one on GitHub, it leaves the list, and goes in `push`
 * when GitHub does not already show it viewed. A file whose mark has since
 * been cleared leaves the list too. The rest wait for a later push.
 *
 * Each file is sent once, so unmarking it on GitHub afterwards sticks.
 */
export function pendingPushes(
  record: ViewedRecord,
  pending: readonly string[],
  github: GithubState,
): { push: string[]; remaining: string[] } {
  const push: string[] = [];
  const remaining: string[] = [];
  for (const path of pending) {
    const fingerprint = record[path];
    if (fingerprint === undefined) continue;
    const mode = syncMode(github, { path, fingerprint });
    if (mode.kind !== "synced") {
      remaining.push(path);
    } else if (!mode.file.viewed) {
      push.push(mode.file.path);
    }
  }
  return { push, remaining };
}

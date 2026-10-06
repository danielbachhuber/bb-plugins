// The Viewed boxes the Diff Viewed plugin puts in bb's changes panel, as a
// place to keep a file's Viewed when the thread has no pull request. Pure;
// server.ts calls Diff Viewed's `viewed_list` and `viewed_set`.
//
// Diff Viewed keeps a thread's marks as one record: each marked file's label,
// which for a rename is `previous -> current`, to the `+a -d` counts its diff
// had when it was marked, or "none" for a binary file, whose header shows a
// size instead of counts. A mark counts while those are still the file's.
import type { GithubFile } from "./github";
import type { SyncTarget } from "./service";

const COUNTS = /^\+(\d+) -(\d+)$/;

/** The marked files by path, with the counts they were marked at. */
export function changesPanelFiles(record: Record<string, string>): Map<string, GithubFile> {
  const files = new Map<string, GithubFile>();
  for (const [label, fingerprint] of Object.entries(record)) {
    const arrow = label.lastIndexOf(" -> ");
    const path = arrow === -1 ? label : label.slice(arrow + 4);
    const counts = COUNTS.exec(fingerprint);
    if (fingerprint === "none") files.set(path, { path, additions: 0, deletions: 0, viewed: true });
    else if (counts) files.set(path, { path, additions: Number(counts[1]), deletions: Number(counts[2]), viewed: true });
  }
  return files;
}

/** How Diff Viewed names a file and its diff, to mark it. */
export function changesPanelMark(file: SyncTarget): { path: string; fingerprint: string } {
  return {
    path: file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path,
    fingerprint: file.binary ? "none" : `+${file.added} -${file.removed}`,
  };
}

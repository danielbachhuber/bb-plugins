// The shapes the review core passes around. No I/O lives here.

export type FileStatus = "added" | "deleted" | "modified" | "renamed";

export interface Hunk {
  /** Position in the file's diff, from 0. */
  index: number;
  /** The `@@ … @@` line. */
  header: string;
  /** The header and every body line, joined by newlines. */
  text: string;
  /** Hash of the body without the header, so a hunk that only moved keeps it. */
  hash: string;
}

export interface DiffFile {
  /** The new path, or the old one for a deleted file. */
  path: string;
  /** The old path of a rename, otherwise null. */
  previousPath: string | null;
  status: FileStatus;
  binary: boolean;
  /** Every line before the first hunk: `diff --git`, `index`, `---`, `+++`. */
  header: string;
  hunks: Hunk[];
  /** Hash of the whole file's diff, the identity of a file with no hunks. */
  hash: string;
}

/** One thing a concern can hold: a hunk, or a whole file that has no hunks. */
export interface Item {
  path: string;
  index: number;
  kind: "hunk" | "file";
  hash: string;
}

/** An item placed in a concern, as stored when a grouping is accepted. */
export interface Assignment {
  path: string;
  index: number;
  hash: string;
  /** Index into the grouping's `concerns`. */
  concern: number;
}

export function itemKey(path: string, index: number): string {
  return `${path}#${index}`;
}

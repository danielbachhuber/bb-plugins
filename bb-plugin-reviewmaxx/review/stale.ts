// Comparing a file's content at grouping time with its content now. Pure.

/** A file's content: hash null means the file does not exist; text null means binary or too large. */
export interface FileState {
  hash: string | null;
  text: string | null;
}

export const ABSENT: FileState = { hash: null, text: null };

export function changedPaths(paths: Iterable<string>, before: Map<string, FileState>, after: Map<string, FileState>): string[] {
  return [...new Set(paths)]
    .sort()
    .filter((path) => (before.get(path)?.hash ?? null) !== (after.get(path)?.hash ?? null));
}

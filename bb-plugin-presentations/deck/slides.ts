// What a deck is: which files in a folder are slides, in what order, and
// which paths inside the folder are safe to read.
//
// Pure functions only. Listing and reading the folder is server.ts's job.

/** A slide file's leading number, or null when the name is not a slide. */
export function slideNumber(name: string): number | null {
  const match = /^(\d+)[^/]*\.md$/i.exec(name);
  return match === null ? null : Number.parseInt(match[1]!, 10);
}

/**
 * The slide files among a folder's entries, in presenting order.
 *
 * Sorted by the number, not the name, so `10-thanks.md` follows
 * `9-demo.md`. Two files with the same number fall back to their names so
 * the order is still stable.
 */
export function pickSlides(names: readonly string[]): string[] {
  return names
    .map((name) => ({ name, number: slideNumber(name) }))
    .filter((entry): entry is { name: string; number: number } => entry.number !== null)
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

/**
 * The name of a listed entry when it sits directly in the deck folder, or
 * null when it is deeper. `files.list` walks subfolders, and an `images/`
 * folder full of `01-diagram.md` drafts is not a slide.
 */
export function directChildName(deckDir: string, listedPath: string): string | null {
  const prefix = `${deckDir.replace(/\/+$/, "")}/`;
  const relative = listedPath.startsWith(prefix)
    ? listedPath.slice(prefix.length)
    : listedPath.startsWith("/")
      ? null
      : listedPath;
  if (relative === null || relative === "" || relative.includes("/")) return null;
  return relative;
}

/**
 * Join path segments and collapse `.` and `..`. Returns null when the result
 * climbs above the start of a relative path.
 */
export function normalizePath(path: string): string | null {
  const absolute = path.startsWith("/");
  const resolved: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return `${absolute ? "/" : ""}${resolved.join("/")}`;
}

/** Where a deck folder lives once the thread's workspace is known. */
export interface DeckLocation {
  /** Absolute path of the folder on its host. */
  dir: string;
  /** The folder relative to the workspace root, or null when it is outside one. */
  workspaceDir: string | null;
}

/**
 * Resolve the folder a user typed. An absolute path and a `~/` path are used
 * as they are; anything else is relative to the thread's workspace, which is
 * what lets a deck that lives in a repository follow the thread into its
 * worktree.
 */
export function resolveDeckDir(args: {
  deckPath: string;
  workspacePath: string | null;
  homeDir: string;
}): DeckLocation {
  const typed = args.deckPath.trim();
  if (typed === "~" || typed.startsWith("~/")) {
    const dir = normalizePath(`${args.homeDir}/${typed.slice(1)}`);
    return { dir: dir ?? args.homeDir, workspaceDir: null };
  }
  if (typed.startsWith("/")) {
    return { dir: normalizePath(typed) ?? "/", workspaceDir: null };
  }
  if (args.workspacePath === null) {
    throw new Error(
      `"${typed}" is a relative path, and this thread has no workspace to resolve it against. Use an absolute path.`,
    );
  }
  const workspaceDir = normalizePath(typed);
  if (workspaceDir === null || workspaceDir === "") {
    throw new Error(`"${typed}" points outside the workspace.`);
  }
  return {
    dir: `${args.workspacePath.replace(/\/+$/, "")}/${workspaceDir}`,
    workspaceDir,
  };
}

/**
 * A path inside the deck folder, relative to it, or null when the path is
 * absolute or climbs out. This is the check that keeps the image route from
 * serving anything but the deck's own files.
 */
export function resolveInDeck(relativePath: string): string | null {
  if (relativePath === "" || relativePath.startsWith("/")) return null;
  const resolved = normalizePath(relativePath);
  if (resolved === null || resolved === "") return null;
  return resolved;
}

/** The last segment of a path, for a deck's display name. */
export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.split("/").at(-1) || trimmed;
}

/**
 * A short label for a slide: its first heading, or the file name without its
 * number and extension when the slide has no heading.
 */
export function slideTitle(content: string, file: string): string {
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^ {0,3}(?:```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const heading = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading !== null && heading[1] !== "") return heading[1]!;
  }
  const stem = file.replace(/\.md$/i, "").replace(/^\d+[-_ .]*/, "");
  return stem.replace(/[-_]+/g, " ").trim() || file;
}

// Parsing `git diff` output into files, hunks, and items. Pure.
import { createHash } from "node:crypto";
import type { DiffFile, FileStatus, Hunk, Item } from "./types";

export function sha1(text: string | Buffer): string {
  return createHash("sha1").update(text).digest("hex");
}

export function parseDiff(text: string): DiffFile[] {
  return text
    .split(/^(?=diff --git )/m)
    .filter((chunk) => chunk.startsWith("diff --git "))
    .map(parseFile);
}

export function itemsOf(files: DiffFile[]): Item[] {
  return files.flatMap((file): Item[] =>
    file.hunks.length > 0
      ? file.hunks.map((hunk) => ({ path: file.path, index: hunk.index, kind: "hunk", hash: hunk.hash }))
      : [{ path: file.path, index: 0, kind: "file", hash: file.hash }],
  );
}

/** git quotes a path holding a quote, backslash, or control character. */
function unquote(path: string): string {
  return path.startsWith('"') && path.endsWith('"') ? (JSON.parse(path) as string) : path;
}

/**
 * A `---`/`+++` path. git appends a tab to a name with a space in it, for
 * GNU patch, so a trailing tab is not part of the name.
 */
function sidePath(raw: string, prefix: "a/" | "b/"): string | null {
  const path = unquote(raw.replace(/\t$/, ""));
  if (path === "/dev/null") return null;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * The paths in `diff --git a/X b/Y`. When X and Y are the same, which is every
 * case without a rename, the line splits exactly in half, even when X has
 * spaces. Renames also carry `rename from`/`rename to`, which win.
 */
function gitLinePaths(line: string): { old: string; new: string } {
  const rest = line.slice("diff --git ".length);
  const length = (rest.length - 5) / 2;
  if (
    Number.isInteger(length) &&
    rest.startsWith("a/") &&
    rest.slice(2 + length, 5 + length) === " b/" &&
    rest.slice(2, 2 + length) === rest.slice(5 + length)
  ) {
    return { old: rest.slice(2, 2 + length), new: rest.slice(5 + length) };
  }
  const at = rest.indexOf(" b/");
  return {
    old: unquote(rest.slice(0, at)).replace(/^a\//, ""),
    new: unquote(rest.slice(at + 1)).replace(/^b\//, ""),
  };
}

function parseFile(chunk: string): DiffFile {
  const lines = chunk.replace(/\n$/, "").split("\n");
  const first = lines.findIndex((line) => line.startsWith("@@ "));
  const headerLines = first === -1 ? lines : lines.slice(0, first);
  const fromGitLine = gitLinePaths(lines[0]!);
  let oldPath = fromGitLine.old;
  let newPath = fromGitLine.new;
  let status: FileStatus = "modified";
  let binary = false;

  for (const line of headerLines) {
    if (line.startsWith("new file mode")) status = "added";
    else if (line.startsWith("deleted file mode")) status = "deleted";
    else if (line.startsWith("rename from ")) {
      status = "renamed";
      oldPath = unquote(line.slice("rename from ".length));
    } else if (line.startsWith("rename to ")) newPath = unquote(line.slice("rename to ".length));
    else if (line.startsWith("Binary files ") || line === "GIT binary patch") binary = true;
    else if (line.startsWith("--- ")) oldPath = sidePath(line.slice(4), "a/") ?? oldPath;
    else if (line.startsWith("+++ ")) newPath = sidePath(line.slice(4), "b/") ?? newPath;
  }

  const bodies: string[][] = [];
  for (const line of first === -1 ? [] : lines.slice(first)) {
    if (line.startsWith("@@ ")) bodies.push([line]);
    else bodies[bodies.length - 1]!.push(line);
  }
  const hunks: Hunk[] = bodies.map((body, index) => ({
    index,
    header: body[0]!,
    text: body.join("\n"),
    hash: sha1(body.slice(1).join("\n")),
  }));

  return {
    path: status === "deleted" ? oldPath : newPath,
    previousPath: status === "renamed" ? oldPath : null,
    status,
    binary,
    header: headerLines.join("\n"),
    hunks,
    hash: sha1(chunk),
  };
}

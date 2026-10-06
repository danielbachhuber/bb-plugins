// Parsing `git diff` output into files, hunks, and items. Pure, and free of
// node imports, because stories render the view in a browser.
import type { DiffFile, FileStatus, Hunk, Item } from "./types";

/**
 * A 53-bit string hash (cyrb53). It only has to tell hunks apart within one
 * file, where a collision would need two different hunks in the same file to
 * match, so it does not need to be cryptographic.
 */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function parseDiff(text: string): DiffFile[] {
  const files = text
    .split(/^(?=diff --git )/m)
    .filter((chunk) => chunk.startsWith("diff --git "))
    .map(parseFile);
  return mergeSamePath(files);
}

/**
 * git writes two sections for one path when a file changes type (a file
 * replaced by a symlink is a delete and an add), and the branch diff lists a
 * path twice when it is deleted in the index but still on disk. One path is
 * one file here, so items stay unique: the later section's hunks follow the
 * earlier one's, renumbered.
 */
function mergeSamePath(files: DiffFile[]): DiffFile[] {
  const byPath = new Map<string, DiffFile>();
  for (const file of files) {
    const seen = byPath.get(file.path);
    if (seen === undefined) {
      byPath.set(file.path, file);
      continue;
    }
    byPath.set(file.path, {
      ...seen,
      status: seen.status === file.status ? seen.status : "modified",
      binary: seen.binary || file.binary,
      hunks: [...seen.hunks, ...file.hunks].map((hunk, index) => ({ ...hunk, index })),
      hash: hashText(seen.hash + file.hash),
    });
  }
  return [...byPath.values()];
}

export function itemsOf(files: DiffFile[]): Item[] {
  return files.flatMap((file): Item[] =>
    file.hunks.length > 0
      ? file.hunks.map((hunk) => ({ path: file.path, index: hunk.index, kind: "hunk", hash: hunk.hash }))
      : [{ path: file.path, index: 0, kind: "file", hash: file.hash }],
  );
}

const ESCAPES: Record<string, string> = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", '"': '"', "\\": "\\" };

/**
 * git quotes a path holding a quote, backslash, or control character, with C
 * escapes: `\"`, `\t`, and octal bytes such as `\007`, which are UTF-8.
 */
function unquote(path: string): string {
  if (!(path.startsWith('"') && path.endsWith('"') && path.length >= 2)) return path;
  const bytes: number[] = [];
  const body = path.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== "\\") {
      bytes.push(...new TextEncoder().encode(ch));
      continue;
    }
    const next = body[i + 1] ?? "";
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(...new TextEncoder().encode(ESCAPES[next] ?? next));
      i += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** The first token of `rest`: a quoted string up to its closing quote, or everything up to " b/". */
function splitQuoted(rest: string): [string, string] | null {
  if (!rest.startsWith('"')) return null;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === "\\") i++;
    else if (rest[i] === '"') return [rest.slice(0, i + 1), rest.slice(i + 2)];
  }
  return null;
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
  const quoted = splitQuoted(rest);
  if (quoted !== null) {
    const strip = (p: string) => p.replace(/^[ab]\//, "");
    return { old: strip(unquote(quoted[0])), new: strip(unquote(quoted[1])) };
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
    hash: hashText(body.slice(1).join("\n")),
  }));

  return {
    path: status === "deleted" ? oldPath : newPath,
    previousPath: status === "renamed" ? oldPath : null,
    status,
    binary,
    header: headerLines.join("\n"),
    hunks,
    hash: hashText(chunk),
  };
}

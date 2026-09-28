import { viewSchema, type Change, type View } from "./schema.js";

/**
 * What an item's changes block shows, worked out without the UI: prose paired
 * line by line, a multi-file patch split into files, the lines each adds and
 * removes, and a lockfile's diff read as the packages whose versions changed.
 */

/** One line of a prose diff: kept, rewritten (with what it was), added, or dropped. */
export interface ProseRow {
  kind: "same" | "changed" | "added" | "removed";
  text: string;
  /** What a changed line was before. */
  from?: string;
}

/** The words that say what a line is about, for telling a rewrite from a new line. */
function words(line: string): Set<string> {
  return new Set(
    line
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3),
  );
}

/**
 * Prose as rows, one per line: each line of `after` paired with the unpaired
 * line of `before` it shares the most words with, when they are mostly the
 * same line, so a rewritten bullet sits beside what it replaced even when the
 * bullets moved. A dropped line shows where it was.
 */
export function pairLines(before: string, after: string): ProseRow[] {
  const old = before.split("\n");
  const next = after.split("\n");
  const pairOf = new Map<number, number>();
  const taken = new Set<number>();
  next.forEach((line, n) => {
    const mine = words(line);
    let best = -1;
    let score = 0;
    old.forEach((candidate, i) => {
      if (taken.has(i)) return;
      if (candidate === line && line.trim() !== "") {
        [best, score] = [i, 2];
        return;
      }
      const theirs = words(candidate);
      const shared = [...theirs].filter((word) => mine.has(word)).length;
      const union = new Set([...theirs, ...mine]).size;
      // Mostly the same words, or a line that grew or shrank around most of the other's.
      const alike = union === 0 ? 0 : shared / union;
      const contained = shared < 2 ? 0 : shared / Math.min(theirs.size, mine.size);
      const similarity = Math.max(alike, contained >= 0.6 ? contained * 0.8 : 0);
      if (similarity > score) [best, score] = [i, similarity];
    });
    if (best >= 0 && score >= 0.45) {
      pairOf.set(n, best);
      taken.add(best);
    }
  });

  const rows: ProseRow[] = [];
  let emitted = -1;
  const dropUpTo = (end: number) => {
    for (let i = emitted + 1; i < end; i++) {
      if (!taken.has(i) && old[i]!.trim() !== "") rows.push({ kind: "removed", text: old[i]! });
    }
    emitted = Math.max(emitted, end);
  };
  // New lines wait for the lines dropped in the same gap, so a replacement reads removed, then added.
  let waiting: ProseRow[] = [];
  const flush = (end: number) => {
    dropUpTo(end);
    rows.push(...waiting);
    waiting = [];
  };
  next.forEach((line, n) => {
    const k = pairOf.get(n);
    if (k === undefined) {
      waiting.push({ kind: line.trim() === "" ? "same" : "added", text: line });
      return;
    }
    flush(k);
    rows.push(old[k] === line ? { kind: "same", text: line } : { kind: "changed", text: line, from: old[k]! });
  });
  flush(old.length);
  return rows;
}

export interface Counts {
  added: number;
  removed: number;
}

/** Lines added and removed, counting a rewritten line as one of each, as a code diff does. */
export function proseCounts(rows: ProseRow[]): Counts {
  return rows.reduce(
    (counts, row) => ({
      added: counts.added + (row.kind === "added" || row.kind === "changed" ? 1 : 0),
      removed: counts.removed + (row.kind === "removed" || row.kind === "changed" ? 1 : 0),
    }),
    { added: 0, removed: 0 },
  );
}

/** A unified patch's added and removed lines, leaving out its file headers. */
export function patchCounts(patch: string): Counts {
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

/**
 * A diff of several files, as `git diff` or `gh pr diff` prints it, as one
 * patch per file named by its new path (its old one, when it was deleted).
 * Text with no `diff --git` header is one file, named by its `+++` line.
 */
export function splitPatch(text: string): Array<{ path: string; patch: string }> {
  const starts = [...text.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  if (starts.length === 0) {
    const named = text.match(/^\+\+\+ (?:b\/)?(.+)$/m)?.[1] ?? text.match(/^--- (?:a\/)?(.+)$/m)?.[1];
    return text.trim() === "" || named === undefined ? [] : [{ path: named.trim(), patch: text }];
  }
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]!.index : text.length;
    const patch = text.slice(start.index, end).replace(/\n+$/, "\n");
    const deleted = /^\+\+\+ \/dev\/null$/m.test(patch);
    return { path: deleted ? start[1]! : start[2]!, patch };
  });
}

const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"];

/** The name of a lockfile this reads, by its path, or null for any other file. */
export function lockfileKind(path: string): string | null {
  const name = path.split("/").at(-1) ?? "";
  return LOCKFILES.includes(name) ? name : null;
}

/** Negative when `a` is the older version. Numeric parts compare as numbers, anything else as text. */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string) => version.replace(/^[^\d]*/, "").split(/[.+-]/);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const [p, q] = [x[i] ?? "0", y[i] ?? "0"];
    const [m, n] = [Number(p), Number(q)];
    const diff = Number.isNaN(m) || Number.isNaN(n) ? p.localeCompare(q) : m - n;
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface PackageChange {
  name: string;
  /** Absent for a package the lockfile adds. */
  from?: string;
  /** Absent for a package the lockfile drops. */
  to?: string;
  kind: "upgrade" | "downgrade" | "added" | "removed";
  /** Whether the manifest's diff names it; null when there is no manifest diff to check. */
  inManifest: boolean | null;
}

/** Each package's version before and after, from the version lines a lockfile's diff removes and adds. */
function versionsIn(kind: string, patch: string): Map<string, { from?: string; to?: string }> {
  const found = new Map<string, { from?: string; to?: string }>();
  const note = (name: string, side: "-" | "+", version: string) => {
    const entry = found.get(name) ?? {};
    // A package can appear twice (pnpm's packages and snapshots); the first says it.
    if (side === "-") entry.from ??= version;
    else entry.to ??= version;
    found.set(name, entry);
  };
  let current: string | null = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---")) continue;
    const side = line[0];
    const body = line.slice(1);
    if (kind === "pnpm-lock.yaml") {
      // "  date-fns@4.2.0:" under packages or snapshots, or "/date-fns@4.2.0:" in older files.
      const entry = body.match(/^ {2}'?\/?((?:@[^@/\s']+\/)?[^@\s'/]+)@([^:(\s']+)/);
      if (entry !== null && (side === "-" || side === "+")) note(entry[1]!, side, entry[2]!);
      continue;
    }
    if (kind === "yarn.lock") {
      // A header like `"date-fns@^4.1.0", date-fns@^4.2.0:` names the entry; `version "4.2.0"` follows.
      const header = body.match(/^"?((?:@[^@/\s"]+\/)?[^@\s"]+)@.*:\s*$/);
      if (header !== null) current = header[1]!;
      const version = body.match(/^\s+version:? "?([^"\s]+)"?/);
      if (version !== null && current !== null && (side === "-" || side === "+")) note(current, side, version[1]!);
      continue;
    }
    // package-lock.json: `"node_modules/a/node_modules/@scope/b": {` names the entry.
    const key = body.match(/^\s*"(?:[^"]*node_modules\/)?((?:@[^/"]+\/)?[^/"]+)": \{\s*$/);
    if (key !== null && body.includes("node_modules/")) current = key[1]!;
    const version = body.match(/^\s*"version": "([^"]+)"/);
    if (version !== null && current !== null && (side === "-" || side === "+")) note(current, side, version[1]!);
  }
  return found;
}

/** The package names a manifest's diff adds or removes lines for. */
function namedInManifest(patch: string): Set<string> {
  const names = new Set<string>();
  for (const line of patch.split("\n")) {
    if (!/^[-+]\s/.test(line) || line.startsWith("+++") || line.startsWith("---")) continue;
    const name = line.match(/^[-+]\s*"((?:@[^/"]+\/)?[^"]+)":/)?.[1];
    if (name !== undefined) names.add(name);
  }
  return names;
}

/**
 * A lockfile's diff as the packages whose version changed, with those the
 * manifest's diff names first, then downgrades, then the rest by name. A
 * package whose version did not change (only its integrity, say) is left out.
 */
export function lockfilePackages(path: string, patch: string, manifestPatch?: string): PackageChange[] {
  const kind = lockfileKind(path);
  if (kind === null) return [];
  const manifest = manifestPatch === undefined ? null : namedInManifest(manifestPatch);
  const changes: PackageChange[] = [];
  for (const [name, { from, to }] of versionsIn(kind, patch)) {
    if (from !== undefined && to !== undefined && from === to) continue;
    const kindOf: PackageChange["kind"] =
      from === undefined ? "added" : to === undefined ? "removed" : compareVersions(from, to) > 0 ? "downgrade" : "upgrade";
    changes.push({ name, from, to, kind: kindOf, inManifest: manifest === null ? null : manifest.has(name) });
  }
  const rank = (change: PackageChange) => (change.inManifest ? 0 : change.kind === "downgrade" ? 1 : 2);
  return changes.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The manifest beside a lockfile: `web/package.json` for `web/package-lock.json`. */
export function manifestFor(lockfilePath: string): string {
  const slash = lockfilePath.lastIndexOf("/");
  return `${slash === -1 ? "" : lockfilePath.slice(0, slash + 1)}package.json`;
}

/**
 * The view with each `patchFile` change read and split into one change per
 * file, named by its path, so what is stored is what was proposed even after
 * the file moves. `read` takes the path as the view gives it.
 */
export async function expandPatchFiles(view: View, read: (path: string) => Promise<string>): Promise<View> {
  if (!view.sections.some((section) => section.items.some((item) => item.changes.some((change) => change.patchFile !== undefined)))) {
    return view;
  }
  const sections = [];
  for (const section of view.sections) {
    const items = [];
    for (const item of section.items) {
      const changes: Change[] = [];
      for (const change of item.changes) {
        if (change.patchFile === undefined) {
          changes.push(change);
          continue;
        }
        let text: string;
        try {
          text = await read(change.patchFile);
        } catch {
          throw new Error(`${item.id}: no diff at ${change.patchFile}.`);
        }
        const files = splitPatch(text);
        if (files.length === 0) throw new Error(`${item.id}: ${change.patchFile} has no diff in it.`);
        for (const file of files) changes.push({ label: file.path, patch: file.patch, collapsed: change.collapsed });
      }
      items.push({ ...item, changes });
    }
    sections.push({ ...section, items });
  }
  // Parsed again, so a diff too big for the view fails the publish with the field named.
  const parsed = viewSchema.safeParse({ ...view, sections });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new Error(`That diff does not fit in the view. ${issue.path.join(".")}: ${issue.message}`);
  }
  return parsed.data;
}

export interface Piece {
  kind: "same" | "added" | "removed";
  text: string;
}

/** The longest common subsequence of two token lists, as runs of kept, removed, and added tokens. */
function diffTokens(a: string[], b: string[]): Piece[] {
  const [n, m] = [a.length, b.length];
  // lengths[i][j]: the longest common run of a[i..] and b[j..].
  const lengths = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i]![j] = a[i] === b[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const pieces: Piece[] = [];
  const push = (kind: Piece["kind"], text: string) => {
    const last = pieces.at(-1);
    if (last?.kind === kind) last.text += text;
    else pieces.push({ kind, text });
  };
  let [i, j] = [0, 0];
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]!);
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) push("removed", a[i++]!);
    else push("added", b[j++]!);
  }
  while (i < n) push("removed", a[i++]!);
  while (j < m) push("added", b[j++]!);
  return pieces;
}

/**
 * Two versions of a line as the words kept, removed, and added, with the
 * spaces between them kept. A lone word kept between two changes is folded
 * into them, so a rewritten phrase reads as the old phrase then the new one,
 * not as words interleaved.
 */
export function diffWords(before: string, after: string): Piece[] {
  // Punctuation is its own token, so "issues" and "issues," match.
  const tokens = (text: string) => text.split(/(\s+|[,.;:!?)(])/).filter((token) => token !== "");
  const pieces = diffTokens(tokens(before), tokens(after));
  const tidy: Piece[] = [];
  let removed = "";
  let added = "";
  const flush = () => {
    if (removed !== "") tidy.push({ kind: "removed", text: removed });
    if (added !== "") tidy.push({ kind: "added", text: added });
    [removed, added] = ["", ""];
  };
  pieces.forEach((piece, i) => {
    if (piece.kind === "removed") removed += piece.text;
    else if (piece.kind === "added") added += piece.text;
    else {
      const inChange = (removed !== "" || added !== "") && i + 1 < pieces.length;
      if (inChange && piece.text.trim().split(/\s+/).length < 2) {
        removed += piece.text;
        added += piece.text;
      } else {
        flush();
        tidy.push(piece);
      }
    }
  });
  flush();
  return tidy;
}

/**
 * A whole-file unified patch from two versions of a text, for a code change
 * given as `before` and `after`: one hunk, every line in it, so bb's diff view
 * can draw it like any other file.
 */
export function textPatch(path: string, before: string, after: string): string {
  const lines = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n").map((line) => `${line}\n`));
  const [old, next] = [lines(before), lines(after)];
  const body = diffTokens(old, next).flatMap((piece) =>
    piece.text
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => `${piece.kind === "same" ? " " : piece.kind === "added" ? "+" : "-"}${line}`),
  );
  return [`--- a/${path}`, `+++ b/${path}`, `@@ -1,${old.length} +1,${next.length} @@`, ...body, ""].join("\n");
}

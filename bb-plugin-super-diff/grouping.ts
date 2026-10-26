// The rules shared by the server and the panel: which files the
// plugin places itself, how a note's anchor finds its line, and the check a
// submission has to pass. No node or SDK imports: the app bundles this file.

export type DiffTarget =
  | { type: "all" | "branch_committed"; mergeBaseBranch: string }
  | { type: "uncommitted" };

export type DiffFile = {
  path: string;
  previousPath: string | null;
  changeKind: string;
  additions: number;
  deletions: number;
  binary: boolean;
  loadMode: "auto" | "on_demand" | "too_large";
  /** bb's id for this version of the file's change. A Viewed mark counts only while it matches. */
  revision?: string;
};

export type Concern = {
  title: string;
  explanation: string;
  files: string[];
  /** One line per file saying what its change is, keyed by path. */
  summaries?: Record<string, string>;
  /** One line covering every file in the concern that has no summary, such as "only the import is renamed". */
  others?: string;
};
/** `asked` marks a note the reviewer asked for with Explain this, rather than one the agent chose to write. */
export type Annotation = { path: string; anchor: string; title: string; body: string; asked?: boolean };
export type Submission = { concerns: Concern[]; annotations: Annotation[] };

/** What the server stores for one thread and diff target. */
export type StoredSuperDiff = {
  target: DiffTarget;
  submission: Submission;
  /** A fingerprint of each file's patch when it was accepted (see `patchHash`), so the panel can tell which files changed since. Missing from Super Diffs stored before it existed. */
  hashes?: Record<string, string>;
  /** Every path on the diff when it was accepted, so the panel can tell when files come and go. */
  paths: string[];
  acceptedAt: string;
};

export const GENERATED_TITLE = "Generated files";
export const UNGROUPED_TITLE = "Not yet grouped";

/**
 * A short fingerprint of a patch (32-bit FNV-1a, in hex). The server stores
 * one per file and the panel recomputes it from the diff it loads, so both
 * sides must use this same function; it only has to notice a change, not
 * resist tampering.
 */
export function patchHash(patch: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < patch.length; i++) {
    hash ^= patch.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Paths still in the diff whose patches differ from when the Super Diff was stored. */
export function changedPaths(stored: StoredSuperDiff, patches: Map<string, string>): Set<string> {
  const changed = new Set<string>();
  for (const [path, hash] of Object.entries(stored.hashes ?? {})) {
    const patch = patches.get(path);
    if (patch !== undefined && patchHash(patch) !== hash) changed.add(path);
  }
  return changed;
}

export function targetKey(target: DiffTarget): string {
  return target.type === "uncommitted" ? "uncommitted" : `${target.type}:${target.mergeBaseBranch}`;
}

const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json", "bun.lockb", "Cargo.lock", "Gemfile.lock", "poetry.lock", "composer.lock", "go.sum"]);

/** Files the plugin places in Generated files itself, by rules that hold in any repository. */
export function isPlacedByRule(file: DiffFile): boolean {
  const name = file.path.split("/").pop() ?? file.path;
  return LOCKFILES.has(name) || name.endsWith(".snap") || file.binary || file.loadMode === "too_large";
}

/** Which half of the diff a line belongs to: "new" for added and unchanged lines, "old" for removed ones. */
export type LineSide = "new" | "old";

/**
 * Where `anchor` is in a patch. Added and unchanged lines come first, with
 * their new-side line numbers; only when none contains it are removed lines
 * searched, with their old-side numbers. So a note on a removed line needs
 * text that is gone from the new side, and an anchor that matched before
 * removed lines counted still finds the same line.
 */
export function anchorLines(patch: string, anchor: string): { side: LineSide; lines: number[] } {
  const found: Record<LineSide, number[]> = { new: [], old: [] };
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    const has = raw.slice(1).includes(anchor);
    if (raw.startsWith("-")) {
      if (has) found.old.push(oldLine);
      oldLine++;
    } else if (raw.startsWith("+")) {
      if (has) found.new.push(newLine);
      newLine++;
    } else if (raw.startsWith(" ")) {
      if (has) found.new.push(newLine);
      oldLine++;
      newLine++;
    }
  }
  return found.new.length > 0 ? { side: "new", lines: found.new } : { side: "old", lines: found.old };
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Checks a submission against the diff, listing every problem at once. */
export function validateSubmission(
  raw: unknown,
  files: DiffFile[],
  patches: Map<string, string>,
): { ok: true; submission: Submission } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const body = raw as { concerns?: unknown; annotations?: unknown } | null;
  if (typeof body !== "object" || body === null || !Array.isArray(body.concerns)) {
    return { ok: false, problems: ['The submission must be an object with a "concerns" array and an "annotations" array.'] };
  }
  const byPath = new Map(files.map((file) => [file.path, file]));
  const placed = new Map<string, number>();
  const concerns: Concern[] = [];

  body.concerns.forEach((value, index) => {
    const concern = value as Partial<Concern>;
    const label = isString(concern?.title) ? `Concern "${concern.title}"` : `Concern ${index + 1}`;
    if (!isString(concern?.title)) problems.push(`${label} has no title.`);
    if (!isString(concern?.explanation)) problems.push(`${label} has no explanation.`);
    if (!Array.isArray(concern?.files) || concern.files.length === 0) {
      problems.push(`${label} has no files.`);
      return;
    }
    for (const path of concern.files) {
      const file = typeof path === "string" ? byPath.get(path) : undefined;
      if (file === undefined) problems.push(`${String(path)} is not in this diff.`);
      else if (isPlacedByRule(file)) problems.push(`${path} is placed by rule in ${GENERATED_TITLE}; leave it out.`);
      else placed.set(path, (placed.get(path) ?? 0) + 1);
    }
    const paths = concern.files.filter((path): path is string => typeof path === "string");
    const summaries: Record<string, string> = {};
    const rawSummaries = concern.summaries;
    if (rawSummaries !== undefined && (typeof rawSummaries !== "object" || rawSummaries === null || Array.isArray(rawSummaries))) {
      problems.push(`${label}: "summaries" must be an object from path to one line.`);
    } else {
      for (const [path, text] of Object.entries(rawSummaries ?? {})) {
        if (!paths.includes(path)) problems.push(`${label}: the summary for ${path} names a file that is not in this concern.`);
        else if (!isString(text)) problems.push(`${label}: the summary for ${path} is empty.`);
        else summaries[path] = text.trim();
      }
    }
    const others = isString(concern.others) ? concern.others.trim() : undefined;
    const unsummarized = paths.filter((path) => summaries[path] === undefined && !(byPath.get(path) && isPlacedByRule(byPath.get(path)!)));
    if (unsummarized.length > 0 && others === undefined) {
      problems.push(
        `${label}: ${unsummarized.length === 1 ? `${unsummarized[0]} has` : `${unsummarized.length} files have`} no summary. Add a line for each in "summaries", or describe them together in "others" when they all change the same way.`,
      );
    }
    concerns.push({
      title: String(concern.title ?? "").trim(),
      explanation: String(concern.explanation ?? "").trim(),
      files: paths,
      summaries,
      ...(others !== undefined && unsummarized.length > 0 ? { others } : {}),
    });
  });

  for (const file of files) {
    if (isPlacedByRule(file)) continue;
    const count = placed.get(file.path) ?? 0;
    if (count === 0) problems.push(`${file.path} is in no concern.`);
    if (count > 1) problems.push(`${file.path} is in ${count} concerns.`);
  }

  const annotations: Annotation[] = [];
  const rawNotes = Array.isArray(body.annotations) ? body.annotations : [];
  if (body.annotations !== undefined && !Array.isArray(body.annotations)) problems.push('"annotations" must be an array.');
  rawNotes.forEach((value, index) => {
    const note = value as Partial<Annotation>;
    const label = isString(note?.title) ? `Annotation "${note.title}"` : `Annotation ${index + 1}`;
    if (!isString(note?.title) || !isString(note?.body) || !isString(note?.path) || !isString(note?.anchor)) {
      problems.push(`${label} needs a path, anchor, title, and body.`);
      return;
    }
    const patch = patches.get(note.path);
    if (!byPath.has(note.path) || patch === undefined) {
      problems.push(`${label}: ${note.path} is not in this diff.`);
      return;
    }
    const { lines } = anchorLines(patch, note.anchor);
    if (lines.length === 0) problems.push(`${label}: anchor "${note.anchor}" is on no line of ${note.path}'s patch.`);
    else if (lines.length > 1) problems.push(`${label}: anchor "${note.anchor}" matches ${lines.length} lines of ${note.path}; make it longer.`);
    else annotations.push({ path: note.path, anchor: note.anchor, title: note.title.trim(), body: note.body.trim() });
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, submission: { concerns, annotations } };
}

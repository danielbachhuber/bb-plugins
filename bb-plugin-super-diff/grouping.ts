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
};

export type Concern = { title: string; explanation: string; files: string[] };
export type Annotation = { path: string; anchor: string; title: string; body: string };
export type Submission = { concerns: Concern[]; annotations: Annotation[] };

/** What the server stores for one thread and diff target. */
export type StoredSuperDiff = {
  target: DiffTarget;
  submission: Submission;
  /** Every path on the diff when it was accepted, so the panel can tell when files come and go. */
  paths: string[];
  acceptedAt: string;
};

export const GENERATED_TITLE = "Generated files";
export const UNGROUPED_TITLE = "Not yet grouped";

export function targetKey(target: DiffTarget): string {
  return target.type === "uncommitted" ? "uncommitted" : `${target.type}:${target.mergeBaseBranch}`;
}

const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json", "bun.lockb", "Cargo.lock", "Gemfile.lock", "poetry.lock", "composer.lock", "go.sum"]);

/** Files the plugin places in Generated files itself, by rules that hold in any repository. */
export function isPlacedByRule(file: DiffFile): boolean {
  const name = file.path.split("/").pop() ?? file.path;
  return LOCKFILES.has(name) || name.endsWith(".snap") || file.binary || file.loadMode === "too_large";
}

/** New-side line numbers of every added or unchanged line containing `anchor`. Removed lines never count. */
export function anchorLines(patch: string, anchor: string): number[] {
  const found: number[] = [];
  let line = 0;
  let inHunk = false;
  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith("-") || raw.startsWith("\\")) continue;
    if (raw.startsWith("+") || raw.startsWith(" ")) {
      if (raw.slice(1).includes(anchor)) found.push(line);
      line++;
    }
  }
  return found;
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
    concerns.push({
      title: String(concern.title ?? "").trim(),
      explanation: String(concern.explanation ?? "").trim(),
      files: concern.files.filter((path): path is string => typeof path === "string"),
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
    const lines = anchorLines(patch, note.anchor);
    if (lines.length === 0) problems.push(`${label}: anchor "${note.anchor}" is not on an added or unchanged line of ${note.path}.`);
    else if (lines.length > 1) problems.push(`${label}: anchor "${note.anchor}" matches ${lines.length} lines of ${note.path}; make it longer.`);
    else annotations.push({ path: note.path, anchor: note.anchor, title: note.title.trim(), body: note.body.trim() });
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, submission: { concerns, annotations } };
}

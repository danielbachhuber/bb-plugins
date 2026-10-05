// What the RPC methods and CLI commands do, composed from the pure core,
// git.ts, and the store. server.ts only resolves the checkout and wires these.
import { formatViolation, parseGrouping, resolveGrouping } from "./check";
import { isMechanical } from "./classify";
import type { ReviewView, StaleInfo } from "./contract";
import { checkCoverage, formatCoverage, shownKeys } from "./coverage";
import { formatHunkList } from "./format";
import { commitsSince, diffStates, fileAtCommit, fileOnDisk, readBranchDiff } from "./git";
import { itemsOf, parseDiff } from "./items";
import { changedPaths, type FileState } from "./stale";
import type { Store } from "./store";
import { itemKey, type DiffFile } from "./types";
import { buildView, type StoredGrouping } from "./view";
import type { ViewTests } from "./contract";
import type { Grouping } from "./grouping";
import type { Assignment } from "./types";
import { addedLines, checkTests, formatTestViolation } from "./tests/check";
import { LABEL } from "./tests/feature";
import { buildOverlay, type TestInputs } from "./tests/overlay";
import { isTestFile, parseSnapshotFile, parseTestFile, snapshotPathFor } from "./tests/parse";

export interface Checkout {
  /** The repository root, on this machine. */
  root: string;
  mergeBaseBranch: string;
}

async function loadBranch(checkout: Checkout) {
  const branch = await readBranchDiff(checkout.root, checkout.mergeBaseBranch);
  return { ...branch, files: parseDiff(branch.diffText) };
}

/** Every path a file in the diff touches: its path, and the old path of a rename. */
function touchedPaths(files: DiffFile[]): string[] {
  return files.flatMap((file) => (file.previousPath ? [file.path, file.previousPath] : [file.path]));
}

async function computeStale(
  root: string,
  stored: StoredGrouping,
  snapshot: Map<string, FileState>,
  files: DiffFile[],
  headSha: string,
): Promise<StaleInfo | null> {
  const paths = [...new Set([...snapshot.keys(), ...touchedPaths(files)])];
  const before = new Map<string, FileState>();
  const after = new Map<string, FileState>();
  for (const path of paths) {
    // A path the snapshot did not store was unchanged from the base then.
    before.set(path, snapshot.get(path) ?? (await fileAtCommit(root, stored.baseSha, path)));
    after.set(path, await fileOnDisk(root, path));
  }
  const changed = changedPaths(paths, before, after);
  if (changed.length === 0) return null;
  const changedFiles = [];
  for (const path of changed) changedFiles.push({ path, patch: await diffStates(before.get(path)!, after.get(path)!) });
  return {
    groupedAt: stored.groupedAt,
    groupedHead: stored.headSha,
    commitsSince: stored.headSha === headSha ? 0 : await commitsSince(root, stored.headSha),
    changedFiles,
  };
}

/** The test files on the branch, read and parsed from the checkout, with their snapshot entries. */
async function loadTests(root: string, files: DiffFile[]): Promise<TestInputs> {
  const inputs: TestInputs = { files: new Map(), snapshots: new Map() };
  for (const file of files) {
    if (!isTestFile(file.path) || file.status === "deleted") continue;
    const source = await fileOnDisk(root, file.path);
    if (source.text === null) continue;
    inputs.files.set(file.path, parseTestFile(file.path, source.text));
    const snap = await fileOnDisk(root, snapshotPathFor(file.path));
    inputs.snapshots.set(file.path, snap.text === null ? new Map() : parseSnapshotFile(snap.text));
  }
  return inputs;
}

/** Each concern's test files: the test files whose hunks it holds. */
function concernTests(assignments: Assignment[], inputs: TestInputs): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const a of assignments) {
    if (!inputs.files.has(a.path)) continue;
    const paths = out.get(a.concern) ?? [];
    if (!paths.includes(a.path)) paths.push(a.path);
    out.set(a.concern, paths);
  }
  return out;
}

function overlays(grouping: Grouping, inputs: TestInputs): Map<number, ViewTests> {
  const out = new Map<number, ViewTests>();
  grouping.concerns.forEach((concern, ci) => {
    if (concern.tests) out.set(ci, buildOverlay(concern.title, concern.tests, inputs));
  });
  return out;
}

export async function getView(store: Store, threadId: string, checkout: Checkout): Promise<ReviewView> {
  const branch = await loadBranch(checkout);
  const stored = store.get(threadId);
  const stale = stored
    ? await computeStale(checkout.root, stored, store.snapshot(threadId), branch.files, branch.headSha)
    : null;
  const inputs = stored ? await loadTests(checkout.root, branch.files) : null;
  return buildView(branch.files, stored, stale, {
    viewed: store.viewed(threadId),
    tests: stored && inputs ? overlays(stored.grouping, inputs) : undefined,
  });
}

/** Mark a file viewed at its current diff, or clear the mark. */
export async function setViewed(store: Store, threadId: string, checkout: Checkout, path: string, viewed: boolean): Promise<void> {
  const file = (await loadBranch(checkout)).files.find((f) => f.path === path);
  store.setViewed(threadId, path, viewed && file ? file.hash : null);
}

/** What `bb reviewmaxx tests` prints: each test on the branch, with its numbered steps. */
export async function testsText(checkout: Checkout): Promise<string> {
  const branch = await loadBranch(checkout);
  const inputs = await loadTests(checkout.root, branch.files);
  if (inputs.files.size === 0) return "No test files on this branch.";
  const lines = ["Cite a whole test as <file>:<test>, or one step as <file>:<test>.<step>.", ""];
  for (const [path, file] of inputs.files) {
    const added = addedLines(branch.files.find((f) => f.path === path)!.hunks.map((h) => h.text));
    const entries = inputs.snapshots.get(path)!;
    lines.push(`${path}  (${file.tests.length} ${file.tests.length === 1 ? "test" : "tests"}, snapshots in ${snapshotPathFor(path)})`);
    for (const test of file.tests) {
      const changed = [...added].some((line) => line >= test.line && line <= test.endLine);
      lines.push(`  ${path}:${test.index}  ${test.name}${changed ? "" : "  (unchanged, no need to cite)"}`);
      for (const step of test.steps) {
        const missing = step.snapshotKey !== null && !entries.has(step.snapshotKey) ? "  (no snapshot entry yet)" : "";
        lines.push(`    ${step.id}  ${LABEL[step.kind]}  ${step.code}${missing}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function hunks(checkout: Checkout, full: boolean): Promise<string> {
  return formatHunkList((await loadBranch(checkout)).files, { full });
}

export async function submit(
  store: Store,
  threadId: string,
  checkout: Checkout,
  raw: unknown,
  now: Date,
): Promise<{ ok: boolean; text: string }> {
  const parsed = parseGrouping(raw);
  if (!parsed.ok) return { ok: false, text: ["The grouping is not in the expected shape:", ...parsed.messages].join("\n") };

  const branch = await loadBranch(checkout);
  const items = itemsOf(branch.files);
  const { assignments, violations } = resolveGrouping(items, parsed.grouping, isMechanical);
  if (violations.length > 0) {
    return {
      ok: false,
      text: [
        `Rejected: ${violations.length} ${violations.length === 1 ? "problem" : "problems"}. Fix them and submit again.`,
        ...violations.map((v) => formatViolation(v, parsed.grouping)),
      ].join("\n"),
    };
  }

  const inputs = await loadTests(checkout.root, branch.files);
  const changed = new Map(
    [...inputs.files.keys()].map((path) => [path, addedLines(branch.files.find((f) => f.path === path)!.hunks.map((h) => h.text))]),
  );
  const lineCounts = new Map<string, number | null>();
  for (const concern of parsed.grouping.concerns) {
    for (const gap of concern.tests?.notCovered ?? []) {
      for (const { path } of gap.evidence) {
        if (lineCounts.has(path)) continue;
        const state = await fileOnDisk(checkout.root, path);
        lineCounts.set(path, state.hash === null ? null : state.text === null ? Number.MAX_SAFE_INTEGER : state.text.split("\n").length);
      }
    }
  }
  const testViolations = checkTests(parsed.grouping, concernTests(assignments, inputs), inputs.files, changed, (path) => lineCounts.get(path) ?? null);
  if (testViolations.length > 0) {
    return {
      ok: false,
      text: [
        `Rejected: ${testViolations.length} ${testViolations.length === 1 ? "problem" : "problems"} with the test scenarios. Fix them and submit again.`,
        ...testViolations.map((v) => formatTestViolation(v, parsed.grouping)),
      ].join("\n"),
    };
  }

  const snapshot = new Map<string, FileState>();
  for (const path of touchedPaths(branch.files)) snapshot.set(path, await fileOnDisk(checkout.root, path));
  store.put(
    threadId,
    { grouping: parsed.grouping, assignments, baseSha: branch.baseSha, headSha: branch.headSha, groupedAt: now.toISOString() },
    snapshot,
  );
  return {
    ok: true,
    text: `Accepted: ${parsed.grouping.concerns.length} concerns, ${items.length} hunks across ${branch.files.length} files.`,
  };
}

export async function verifyData(
  store: Store,
  threadId: string,
  checkout: Checkout,
): Promise<{ ok: boolean; text: string; items: string[] }> {
  const branch = await loadBranch(checkout);
  const items = itemsOf(branch.files);
  const itemKeys = items.map((item) => itemKey(item.path, item.index));
  if (store.get(threadId) === null) {
    return { ok: false, text: "No grouping yet. Generate one from the panel first.", items: itemKeys };
  }
  const view = await getView(store, threadId, checkout);
  const report = formatCoverage(checkCoverage(branch.changedPaths, items, shownKeys(view)));
  return { ...report, items: itemKeys };
}

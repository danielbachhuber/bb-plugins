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

export async function getView(store: Store, threadId: string, checkout: Checkout): Promise<ReviewView> {
  const branch = await loadBranch(checkout);
  const stored = store.get(threadId);
  const stale = stored
    ? await computeStale(checkout.root, stored, store.snapshot(threadId), branch.files, branch.headSha)
    : null;
  return buildView(branch.files, stored, stale);
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

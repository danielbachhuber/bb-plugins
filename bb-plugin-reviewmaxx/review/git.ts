// Every `git` call and every read of the checkout's files. The only I/O in
// review/ besides store.ts. The checkout is on this machine by construction:
// server.ts refuses an environment whose path is not a work tree here.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha1 } from "./items";
import { ABSENT, type FileState } from "./stale";

const MAX_BUFFER = 256 * 1024 * 1024;
/** Larger files are compared by hash only and shown as "changed" without a diff. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

function git(cwd: string, args: string[], okCodes: number[] = [0]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", cwd, "-c", "core.quotePath=false", ...args],
      { encoding: "buffer", maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
        if (okCodes.includes(code)) resolve(stdout);
        else reject(new Error(`git ${args.join(" ")}: ${stderr.toString("utf8").trim() || error?.message}`));
      },
    );
  });
}

async function gitText(cwd: string, args: string[], okCodes?: number[]): Promise<string> {
  return (await git(cwd, args, okCodes)).toString("utf8");
}

function stateOf(buffer: Buffer): FileState {
  const binary = buffer.length > MAX_TEXT_BYTES || buffer.subarray(0, 8000).includes(0);
  return { hash: sha1(buffer), text: binary ? null : buffer.toString("utf8") };
}

export async function toplevel(dir: string): Promise<string | null> {
  try {
    return (await gitText(dir, ["rev-parse", "--show-toplevel"])).trim() || null;
  } catch {
    return null;
  }
}

export async function readBranchDiff(
  root: string,
  mergeBaseBranch: string,
): Promise<{ baseSha: string; headSha: string; diffText: string; changedPaths: string[] }> {
  const headSha = (await gitText(root, ["rev-parse", "HEAD"])).trim();
  const baseSha = (await gitText(root, ["merge-base", "HEAD", mergeBaseBranch])).trim();
  const diffArgs = ["--no-color", "--no-ext-diff", "-M"];
  const tracked = await gitText(root, ["diff", ...diffArgs, baseSha]);
  const trackedNames = (await gitText(root, ["diff", "--name-only", "-z", "-M", baseSha])).split("\0").filter(Boolean);
  const untracked = (await gitText(root, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
  const untrackedDiffs: string[] = [];
  for (const file of untracked) {
    // --no-index exits 1 when the sides differ, which they always do here.
    untrackedDiffs.push(await gitText(root, ["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", file], [0, 1]));
  }
  return { baseSha, headSha, diffText: tracked + untrackedDiffs.join(""), changedPaths: [...trackedNames, ...untracked] };
}

export async function fileOnDisk(root: string, file: string): Promise<FileState> {
  try {
    return stateOf(await readFile(path.join(root, file)));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return ABSENT;
    throw cause;
  }
}

export async function fileAtCommit(root: string, sha: string, file: string): Promise<FileState> {
  try {
    return stateOf(await git(root, ["cat-file", "blob", `${sha}:${file}`]));
  } catch {
    return ABSENT;
  }
}

/** The diff from one state to the other as bare `@@` hunks; "" when either side is binary. */
export async function diffStates(before: FileState, after: FileState): Promise<string> {
  if ((before.hash !== null && before.text === null) || (after.hash !== null && after.text === null)) return "";
  const dir = await mkdtemp(path.join(tmpdir(), "reviewmaxx-"));
  try {
    if (before.text !== null) await writeFile(path.join(dir, "a"), before.text);
    if (after.text !== null) await writeFile(path.join(dir, "b"), after.text);
    const out = await gitText(
      dir,
      ["diff", "--no-color", "--no-ext-diff", "--no-index", "--", before.text === null ? "/dev/null" : "a", after.text === null ? "/dev/null" : "b"],
      [0, 1],
    );
    const start = out.indexOf("\n@@");
    return start === -1 ? "" : out.slice(start + 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Commits on HEAD since `oldHead`, or null when `oldHead` is no longer an ancestor. */
export async function commitsSince(root: string, oldHead: string): Promise<number | null> {
  try {
    await git(root, ["merge-base", "--is-ancestor", oldHead, "HEAD"]);
  } catch {
    return null;
  }
  return Number((await gitText(root, ["rev-list", "--count", `${oldHead}..HEAD`])).trim());
}

// Every `git` call and every read of the checkout's files. The only I/O in
// review/ besides store.ts. The checkout is on this machine by construction:
// server.ts refuses an environment whose path is not a work tree here.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ABSENT, type FileState } from "./stale";

const MAX_BUFFER = 256 * 1024 * 1024;
/** Every diff prints a/ and b/ paths relative to the repository root. */
const DIFF_ARGS = ["--no-color", "--no-ext-diff", "--no-relative", "--src-prefix=a/", "--dst-prefix=b/"];
/** Larger files are compared by hash only and shown as "changed" without a diff. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

function git(cwd: string, args: string[], okCodes: number[] = [0]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      // Pin the settings that change how paths print, whatever the user's config says.
      ["-C", cwd, "-c", "core.quotePath=false", "-c", "diff.mnemonicPrefix=false", "-c", "diff.noprefix=false", ...args],
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

function sha1(buffer: Buffer): string {
  return createHash("sha1").update(buffer).digest("hex");
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
  const tracked = await gitText(root, ["diff", ...DIFF_ARGS, "-M", baseSha]);
  const trackedNames = (await gitText(root, ["diff", "--name-only", "--no-relative", "-z", "-M", baseSha])).split("\0").filter(Boolean);
  // A nested repository is listed as "dir/"; it is one item, named without the slash.
  const untracked = (await gitText(root, ["ls-files", "--others", "--exclude-standard", "-z"]))
    .split("\0")
    .filter(Boolean)
    .map((file) => file.replace(/\/$/, ""));
  const untrackedDiffs: string[] = [];
  for (const file of untracked) {
    // --no-index exits 1 when the sides differ, which they always do here.
    const out = await gitText(root, ["diff", ...DIFF_ARGS, "--no-index", "--", "/dev/null", file], [0, 1]);
    // git has nothing to show for a nested repository or a symlink to a
    // directory, but it is still on the branch, so it is a whole-file item.
    untrackedDiffs.push(out || `diff --git a/${file} b/${file}\nnew file mode 160000\n`);
  }
  return { baseSha, headSha, diffText: tracked + untrackedDiffs.join(""), changedPaths: [...trackedNames, ...untracked] };
}

export async function fileOnDisk(root: string, file: string): Promise<FileState> {
  const full = path.join(root, file);
  try {
    const stats = await lstat(full);
    if (stats.isSymbolicLink()) return stateOf(Buffer.from(await readlink(full))); // what git stores for a symlink
    if (stats.isDirectory()) {
      // A submodule or nested repository: its state is the commit it has checked out.
      const head = await gitText(full, ["rev-parse", "HEAD"]).catch(() => "");
      return { hash: sha1(Buffer.from(`dir:${head.trim()}`)), text: null };
    }
    return stateOf(await readFile(full));
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
  const dir = await mkdtemp(path.join(tmpdir(), "super-diff-"));
  try {
    if (before.text !== null) await writeFile(path.join(dir, "a"), before.text);
    if (after.text !== null) await writeFile(path.join(dir, "b"), after.text);
    const out = await gitText(
      dir,
      ["diff", ...DIFF_ARGS, "--no-index", "--", before.text === null ? "/dev/null" : "a", after.text === null ? "/dev/null" : "b"],
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

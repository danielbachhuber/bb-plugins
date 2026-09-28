// The git and filesystem boundary. Every command Plugin Shelf runs is here.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Commit, IndexedPlugin } from "./types";

const exec = promisify(execFile);

export type RunGit = (cwd: string, args: string[]) => Promise<string>;

export const runGit: RunGit = async (cwd, args) => {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
};

export async function findCheckout(
  git: RunGit,
  dir: string,
): Promise<{ root: string; originUrl: string } | { error: string }> {
  let root: string;
  try {
    root = (await git(dir, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return { error: `${dir} is not inside a git checkout.` };
  }
  if (!existsSync(join(root, ".bb/plugins.json"))) {
    return { error: `${root} has no .bb/plugins.json, so it is not a plugin checkout.` };
  }
  try {
    return { root, originUrl: (await git(root, ["remote", "get-url", "origin"])).trim() };
  } catch {
    return { error: `${root} has no origin remote to compare releases against.` };
  }
}

export async function readIndex(root: string, installedIds: Set<string>): Promise<IndexedPlugin[]> {
  const index = JSON.parse(await readFile(join(root, ".bb/plugins.json"), "utf8")) as {
    plugins: { name: string; source: string }[];
  };
  return Promise.all(
    index.plugins.map(async ({ name: id, source }) => {
      const dir = source.replace(/^\.\//, "").replace(/\/$/, "");
      const pkg = JSON.parse(await readFile(join(root, dir, "package.json"), "utf8")) as {
        version?: string;
        bb?: { name?: string; description?: string };
      };
      return {
        id,
        dir,
        name: pkg.bb?.name ?? id,
        description: pkg.bb?.description ?? "",
        version: pkg.version ?? "0.0.0",
        installed: installedIds.has(id),
      };
    }),
  );
}

export async function remoteTags(git: RunGit, root: string): Promise<string[]> {
  const out = await git(root, ["ls-remote", "--tags", "--refs", "origin"]);
  return out
    .split("\n")
    .map((line) => line.split("\t")[1] ?? "")
    .filter((ref) => ref.startsWith("refs/tags/"))
    .map((ref) => ref.slice("refs/tags/".length));
}

export async function fetchMain(git: RunGit, root: string): Promise<void> {
  await git(root, ["fetch", "--quiet", "origin", "main"]);
}

const RECORD = "\x1e";
const FIELD = "\x1f";

export async function commitsSince(
  git: RunGit,
  root: string,
  tag: string | null,
  dir: string,
): Promise<Commit[]> {
  const range = tag === null ? "origin/main" : `${tag}..origin/main`;
  const out = await git(root, [
    "log", "--no-merges", "--name-only",
    `--format=${RECORD}%H${FIELD}%s${FIELD}%cI`,
    range, "--", dir,
  ]);
  return out
    .split(RECORD)
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const [header, ...rest] = chunk.split("\n");
      const [sha, subject, date] = header!.split(FIELD);
      return {
        sha: sha!,
        subject: subject!,
        date: date!,
        files: rest.map((line) => line.trim()).filter((line) => line !== ""),
      };
    });
}

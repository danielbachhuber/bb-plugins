import { execFile } from "node:child_process";
import { parseRemoteSlug } from "./projects.js";

/**
 * What a thread started for a pull request needs from the checkout before it
 * starts: the base branch and the pull request's head fetched, and the ref its
 * diff should compare against.
 *
 * bb diffs a thread against its environment's merge base, and with none set it
 * falls back to the default branch. A pull request stacked on another one, or
 * based on any branch but the default, then shows changes that are not its
 * own. Setting the merge base to `<remote>/<base>` from the start makes the
 * thread's diff the pull request's diff.
 */

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export type GitRun = (cwd: string, args: string[]) => Promise<GitResult>;

/** Argument-array spawn, never a shell string. */
export const runGit: GitRun = (cwd, args) =>
  new Promise((resolve) => {
    execFile("git", ["-C", cwd, ...args], { timeout: 120_000 }, (error, stdout, stderr) =>
      resolve({
        ok: !error,
        stdout: stdout ?? "",
        stderr: (stderr ?? "").trim() || (error ? error.message : ""),
      }),
    );
  });

/**
 * Every remote with its URL as configured, read from
 * `git config --get-regexp '^remote\..*\.url$'`. Not `git remote -v`, which
 * shows the URL after any `insteadOf` rewrite, and so can hide which
 * repository a remote is.
 */
export function parseRemotes(output: string): { name: string; url: string }[] {
  const remotes = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = /^remote\.(.+)\.url\s+(\S+)$/.exec(line.trim());
    if (match && !remotes.has(match[1]!)) remotes.set(match[1]!, match[2]!);
  }
  return [...remotes].map(([name, url]) => ({ name, url }));
}

/**
 * The remote pointing at a repository, or null when the checkout has none.
 *
 * Not always origin: a checkout cloned from a fork keeps the fork as origin
 * and the repository the pull requests are against as another remote.
 */
export function remoteForRepo(remotes: { name: string; url: string }[], repo: string): string | null {
  const wanted = repo.toLowerCase();
  return remotes.find((remote) => parseRemoteSlug(remote.url)?.toLowerCase() === wanted)?.name ?? null;
}

/** The merge base for a pull request against `baseRef`: the remote's copy, never a local branch that may be behind. */
export function mergeBaseRef(remote: string, baseRef: string): string {
  return `${remote}/${baseRef}`;
}

interface ManagedWorktree {
  type: "host";
  workspace: { type: "managed-worktree"; baseBranch: { kind: string; name?: string } };
}

function isDefaultManagedWorktree(environment: unknown): environment is ManagedWorktree {
  const candidate = environment as Partial<ManagedWorktree> | null | undefined;
  return (
    candidate?.type === "host" &&
    candidate.workspace?.type === "managed-worktree" &&
    candidate.workspace.baseBranch?.kind === "default"
  );
}

/**
 * Points a new worktree on the default base at `ref` instead, which bb then
 * records as the environment's merge base.
 *
 * Only a new worktree on the default base is changed. Any other environment
 * is one the user chose, and the project checkout or an existing worktree is
 * shared with other threads, whose diffs a merge base set here would change.
 */
export function withWorktreeBase<T>(environment: T, ref: string): T {
  if (!isDefaultManagedWorktree(environment)) return environment;
  return {
    ...environment,
    workspace: { ...environment.workspace, baseBranch: { kind: "named", name: ref } },
  } as T;
}

export type BranchUpdate = "absent" | "current" | "updated" | "ahead" | "diverged" | "failed";

/**
 * Moves a local branch to the pull request's head when doing so loses nothing.
 *
 * Behind the head, it fast-forwards. After a rebase or force-push on GitHub
 * the branch has diverged; it is reset only when `git cherry` finds none of
 * its commits missing from the head, which is what a rebase that changed
 * nothing in them looks like. Ahead of the head means unpushed work, and a
 * diverged branch with commits of its own is somebody's work too: both are
 * left alone and reported. So is a branch checked out in a worktree, which
 * git refuses to move.
 */
export async function updateLocalBranch(git: GitRun, cwd: string, branch: string, head: string): Promise<BranchUpdate> {
  const existing = await git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  if (!existing.ok) return "absent";
  const local = existing.stdout.trim();
  if (local === head) return "current";
  if ((await git(cwd, ["merge-base", "--is-ancestor", head, local])).ok) return "ahead";
  const behind = (await git(cwd, ["merge-base", "--is-ancestor", local, head])).ok;
  if (!behind) {
    const cherry = await git(cwd, ["cherry", head, local]);
    if (!cherry.ok || cherry.stdout.split("\n").some((line) => line.startsWith("+"))) return "diverged";
  }
  return (await git(cwd, ["branch", "--force", branch, head])).ok ? "updated" : "failed";
}

export interface PullRequestFetch {
  /** `<remote>/<base>`, for the thread's merge base. */
  mergeBase: string;
  /** The pull request's head commit, or null when it could not be fetched. */
  head: string | null;
  /** What went wrong without stopping the thread from starting, for the log. */
  warnings: string[];
}

/**
 * Fetches a pull request's base branch and head from the remote for its
 * repository, so a worktree cut from the base, and a branch checked out from
 * the head, match GitHub rather than the last fetch.
 *
 * The head comes from `refs/pull/<n>/head`, which the base repository keeps
 * for every pull request, fork or not. Returns null when no remote points at
 * the repository, since there is then no `<remote>/<base>` to diff against.
 */
export async function fetchPullRequest(
  git: GitRun,
  cwd: string,
  pr: { repo: string; number: number; baseRef: string },
): Promise<PullRequestFetch | null> {
  const remote = remoteForRepo(parseRemotes((await git(cwd, ["config", "--get-regexp", "^remote\\..*\\.url$"])).stdout), pr.repo);
  if (remote === null) return null;
  const warnings: string[] = [];
  const base = await git(cwd, ["fetch", remote, `+refs/heads/${pr.baseRef}:refs/remotes/${remote}/${pr.baseRef}`]);
  if (!base.ok) warnings.push(`could not fetch ${remote}/${pr.baseRef}: ${base.stderr}`);
  let head: string | null = null;
  const fetched = await git(cwd, ["fetch", remote, `refs/pull/${pr.number}/head`]);
  if (fetched.ok) {
    const resolved = await git(cwd, ["rev-parse", "FETCH_HEAD"]);
    if (resolved.ok) head = resolved.stdout.trim();
  } else {
    warnings.push(`could not fetch ${pr.repo}#${pr.number}'s head: ${fetched.stderr}`);
  }
  return { mergeBase: mergeBaseRef(remote, pr.baseRef), head, warnings };
}

/**
 * Gets the checkout ready for a thread about a pull request, and returns the
 * environment to start it in.
 *
 * Fetches the base and head, moves a stale local copy of the head branch when
 * that loses nothing (so `gh pr checkout` in the thread finds it current), and
 * points a new default worktree at `<remote>/<base>`. Returns the head commit
 * too, for a caller with a worktree of its own to update. `mergeBase` is null when
 * the checkout has no remote for the repository; the environment is then
 * returned as it was.
 */
export async function prepareForPullRequest<T>(
  git: GitRun,
  cwd: string,
  pr: { repo: string; number: number; baseRef: string; headRef?: string },
  environment: T,
): Promise<{ environment: T; mergeBase: string | null; head: string | null; warnings: string[] }> {
  const fetched = await fetchPullRequest(git, cwd, pr);
  if (fetched === null) {
    return { environment, mergeBase: null, head: null, warnings: [`no remote in ${cwd} points at ${pr.repo}`] };
  }
  const warnings = [...fetched.warnings];
  if (fetched.head !== null && pr.headRef) {
    const update = await updateLocalBranch(git, cwd, pr.headRef, fetched.head);
    if (update === "diverged" || update === "failed") {
      warnings.push(`left the local ${pr.headRef} as it was (${update}); it does not match ${pr.repo}#${pr.number}`);
    }
  }
  return { environment: withWorktreeBase(environment, fetched.mergeBase), mergeBase: fetched.mergeBase, head: fetched.head, warnings };
}

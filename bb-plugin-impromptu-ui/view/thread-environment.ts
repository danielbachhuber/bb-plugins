/**
 * Where a `thread` button's new thread runs.
 *
 * Without `baseBranch`, the project's default, as the composer would pick.
 * With it, a new worktree cut from that ref, which bb also records as the
 * environment's merge base, so the thread's diff compares against the same
 * branch the pull request will. That is what a PR against another PR's branch
 * needs from its first turn: compared against `main`, its diff shows the
 * parent PR's changes too.
 */
export type ThreadEnvironment =
  | { type: "host"; workspace: { type: "personal" } }
  | { type: "project-default" }
  | { type: "host"; hostId: string; workspace: { type: "managed-worktree"; baseBranch: { kind: "named"; name: string } } };

export function threadEnvironment(options: {
  baseBranch: string | undefined;
  personal: boolean;
  /** The host holding the project's checkout, which a worktree is made on. */
  hostId: string | null;
  project: string;
}): ThreadEnvironment {
  const { baseBranch, personal, hostId, project } = options;
  if (baseBranch === undefined) return personal ? { type: "host", workspace: { type: "personal" } } : { type: "project-default" };
  if (personal) throw new Error(`The personal project has no git checkout to base ${baseBranch} on.`);
  if (hostId === null) throw new Error(`No checkout of ${project} was found to make a worktree from ${baseBranch} in.`);
  return { type: "host", hostId, workspace: { type: "managed-worktree", baseBranch: { kind: "named", name: baseBranch } } };
}

/**
 * The `git fetch` arguments that bring `baseBranch` up to date in the
 * checkout, or null when it does not name a remote's branch, as a local branch
 * does not. A worktree is cut from the ref as the checkout has it, so a branch
 * pushed or rebased on GitHub since the last fetch would otherwise start the
 * thread on a stale or missing commit.
 */
export function fetchArgsFor(baseBranch: string, remotes: readonly string[]): string[] | null {
  const slash = baseBranch.indexOf("/");
  if (slash <= 0) return null;
  const remote = baseBranch.slice(0, slash);
  const branch = baseBranch.slice(slash + 1);
  if (!remotes.includes(remote) || branch === "") return null;
  return ["fetch", remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`];
}

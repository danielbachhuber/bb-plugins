import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fetchPullRequest,
  parseRemotes,
  prepareForPullRequest,
  remoteForRepo,
  runGit,
  updateLocalBranch,
  withWorktreeBase,
} from "./projects.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "octocat", GIT_AUTHOR_EMAIL: "octocat@example.com", GIT_COMMITTER_NAME: "octocat", GIT_COMMITTER_EMAIL: "octocat@example.com" },
  }).trim();
}

function commit(cwd: string, file: string, text: string): string {
  writeFileSync(join(cwd, file), text);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", `${file}: ${text}`);
  return git(cwd, "rev-parse", "HEAD");
}

/**
 * A stand-in for GitHub: a repository with `main`, a `feature` branch, and a
 * pull request's head at `refs/pull/7/head`, plus a checkout cloned from it
 * with `upstream` named after acme/widgets, as a fork-and-upstream checkout
 * would be.
 */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "gh-shared-git-"));
  const github = join(root, "github");
  git(root, "init", "-q", "-b", "main", github);
  commit(github, "a.txt", "one");
  git(github, "checkout", "-q", "-b", "feature");
  commit(github, "b.txt", "two");
  git(github, "update-ref", "refs/pull/7/head", "feature");
  git(github, "checkout", "-q", "main");

  const checkout = join(root, "checkout");
  git(root, "clone", "-q", "-o", "upstream", github, checkout);
  git(checkout, "remote", "set-url", "upstream", "https://github.com/acme/widgets.git");
  git(checkout, "config", `url.${github}.insteadOf`, "https://github.com/acme/widgets.git");
  git(checkout, "remote", "add", "origin", "git@github.com:octocat/widgets.git");
  return { github, checkout };
}

describe("withWorktreeBase", () => {
  const worktree = { type: "host", hostId: "host_1", workspace: { type: "managed-worktree", baseBranch: { kind: "default" } } } as const;

  it("points a new worktree on the default base at the pull request's base", () => {
    expect(withWorktreeBase(worktree, "origin/feature")).toEqual({
      type: "host",
      hostId: "host_1",
      workspace: { type: "managed-worktree", baseBranch: { kind: "named", name: "origin/feature" } },
    });
  });

  it("leaves an environment the user chose alone", () => {
    const named = { ...worktree, workspace: { type: "managed-worktree", baseBranch: { kind: "named", name: "release" } } };
    const local = { type: "host", hostId: "host_1", workspace: { type: "unmanaged", path: null } };
    const reuse = { type: "reuse", environmentId: "env_1" };
    for (const environment of [named, local, reuse, { type: "project-default" }, undefined]) {
      expect(withWorktreeBase(environment, "origin/feature")).toBe(environment);
    }
  });
});

describe("remotes", () => {
  it("finds the remote for the repository, which is not always origin", () => {
    const remotes = parseRemotes(
      ["remote.origin.url git@github.com:octocat/widgets.git", "remote.upstream.url https://github.com/acme/widgets.git"].join("\n"),
    );
    expect(remoteForRepo(remotes, "Acme/Widgets")).toBe("upstream");
    expect(remoteForRepo(remotes, "acme/gadgets")).toBeNull();
  });
});

describe("fetchPullRequest", () => {
  it("fetches the base and the head from the repository's remote, and names the merge base there", async () => {
    const { github, checkout } = setup();
    const moved = commit(github, "c.txt", "three");
    git(github, "checkout", "-q", "feature");
    const head = commit(github, "d.txt", "four");
    git(github, "update-ref", "refs/pull/7/head", head);

    const fetched = await fetchPullRequest(runGit, checkout, { repo: "acme/widgets", number: 7, baseRef: "main" });
    expect(fetched).toEqual({ mergeBase: "upstream/main", head, warnings: [] });
    expect(git(checkout, "rev-parse", "upstream/main")).toBe(moved);
  });

  it("returns null when no remote points at the repository", async () => {
    const { checkout } = setup();
    expect(await fetchPullRequest(runGit, checkout, { repo: "acme/gadgets", number: 7, baseRef: "main" })).toBeNull();
  });

  it("reports a head it could not fetch, and still names the merge base", async () => {
    const { checkout } = setup();
    const fetched = await fetchPullRequest(runGit, checkout, { repo: "acme/widgets", number: 99, baseRef: "main" });
    expect(fetched).toMatchObject({ mergeBase: "upstream/main", head: null });
    expect(fetched!.warnings).toHaveLength(1);
  });
});

describe("updateLocalBranch", () => {
  async function withLocalFeature() {
    const { github, checkout } = setup();
    git(checkout, "branch", "feature", "upstream/feature");
    return { github, checkout };
  }

  it("fast-forwards a branch that is behind, and creates nothing", async () => {
    const { github, checkout } = await withLocalFeature();
    git(github, "checkout", "-q", "feature");
    const head = commit(github, "d.txt", "four");
    git(checkout, "fetch", "-q", "upstream");

    expect(await updateLocalBranch(runGit, checkout, "feature", head)).toBe("updated");
    expect(git(checkout, "rev-parse", "feature")).toBe(head);
    expect(await updateLocalBranch(runGit, checkout, "missing", head)).toBe("absent");
  });

  it("resets a branch rebased on GitHub when it has no commits of its own", async () => {
    const { github, checkout } = await withLocalFeature();
    git(github, "checkout", "-q", "main");
    commit(github, "c.txt", "three");
    git(github, "checkout", "-q", "feature");
    git(github, "rebase", "-q", "main");
    const head = git(github, "rev-parse", "HEAD");
    git(checkout, "fetch", "-q", "upstream");

    expect(await updateLocalBranch(runGit, checkout, "feature", head)).toBe("updated");
    expect(git(checkout, "rev-parse", "feature")).toBe(head);
  });

  it("leaves unpushed and diverged work alone", async () => {
    const { github, checkout } = await withLocalFeature();
    const head = git(checkout, "rev-parse", "upstream/feature");
    git(checkout, "checkout", "-q", "feature");
    const local = commit(checkout, "mine.txt", "unpushed");
    git(checkout, "checkout", "-q", "main");
    expect(await updateLocalBranch(runGit, checkout, "feature", head)).toBe("ahead");

    git(github, "checkout", "-q", "feature");
    const theirs = commit(github, "theirs.txt", "pushed");
    git(checkout, "fetch", "-q", "upstream");
    expect(await updateLocalBranch(runGit, checkout, "feature", theirs)).toBe("diverged");
    expect(git(checkout, "rev-parse", "feature")).toBe(local);
  });
});

describe("prepareForPullRequest", () => {
  const worktree = { type: "host", hostId: "host_1", workspace: { type: "managed-worktree", baseBranch: { kind: "default" } } };

  it("fetches, brings the local head branch up to date, and bases a new worktree on the remote's base", async () => {
    const { github, checkout } = setup();
    git(checkout, "branch", "feature", "upstream/feature");
    git(github, "checkout", "-q", "feature");
    const head = commit(github, "d.txt", "four");
    git(github, "update-ref", "refs/pull/7/head", head);

    const prepared = await prepareForPullRequest(runGit, checkout, { repo: "acme/widgets", number: 7, baseRef: "main", headRef: "feature" }, worktree);
    expect(prepared).toEqual({
      environment: { ...worktree, workspace: { type: "managed-worktree", baseBranch: { kind: "named", name: "upstream/main" } } },
      mergeBase: "upstream/main",
      head,
      warnings: [],
    });
    expect(git(checkout, "rev-parse", "feature")).toBe(head);
  });

  it("returns the environment as it was when no remote points at the repository", async () => {
    const { checkout } = setup();
    const prepared = await prepareForPullRequest(runGit, checkout, { repo: "acme/gadgets", number: 7, baseRef: "main" }, worktree);
    expect(prepared).toMatchObject({ environment: worktree, mergeBase: null });
  });
});

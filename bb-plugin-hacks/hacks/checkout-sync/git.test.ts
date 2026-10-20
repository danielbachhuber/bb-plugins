// Against real repositories in a temporary directory: an "origin" bare repo, a
// checkout tracking it, and a second clone that pushes to it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutSync, FETCH_EVERY_MS, runGit, type RunGit } from "./git";

let root: string;
let checkout: string;
let other: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function commit(cwd: string, file: string): void {
  writeFileSync(join(cwd, file), file);
  git(cwd, "add", file);
  git(cwd, "-c", "user.name=octocat", "-c", "user.email=octocat@example.com", "commit", "-qm", file);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "checkout-sync-"));
  const origin = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  checkout = join(root, "checkout");
  other = join(root, "other");
  git(root, "clone", "-q", origin, checkout);
  commit(checkout, "a.txt");
  git(checkout, "push", "-q", "-u", "origin", "main");
  git(root, "clone", "-q", origin, other);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createCheckoutSync", () => {
  it("is up to date after cloning", async () => {
    const sync = createCheckoutSync(runGit);
    expect(await sync.status(checkout)).toEqual({
      branch: "main",
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      error: null,
    });
  });

  it("sees a push elsewhere once it fetches, and pulls it", async () => {
    let now = 0;
    const sync = createCheckoutSync(runGit, () => now);
    await sync.status(checkout);

    commit(other, "b.txt");
    commit(other, "c.txt");
    git(other, "push", "-q");

    // Within the fetch interval, only local refs are compared.
    expect((await sync.status(checkout))?.behind).toBe(0);
    now += FETCH_EVERY_MS;
    expect((await sync.status(checkout))?.behind).toBe(2);

    expect(await sync.pull(checkout)).toMatchObject({ ahead: 0, behind: 0, error: null });
    expect(git(checkout, "log", "--format=%s").trim().split("\n")).toEqual(["c.txt", "b.txt", "a.txt"]);
  });

  it("fetches but does not merge a diverged branch", async () => {
    const sync = createCheckoutSync(runGit);
    commit(other, "b.txt");
    git(other, "push", "-q");
    commit(checkout, "local.txt");

    expect(await sync.pull(checkout)).toMatchObject({ ahead: 1, behind: 1, error: null });
    expect(git(checkout, "log", "-1", "--format=%s").trim()).toBe("local.txt");
  });

  it("reports a merge that local changes block, until one succeeds", async () => {
    const sync = createCheckoutSync(runGit);
    commit(other, "b.txt");
    git(other, "push", "-q");
    writeFileSync(join(checkout, "b.txt"), "uncommitted");

    const blocked = await sync.pull(checkout);
    expect(blocked?.behind).toBe(1);
    expect(blocked?.error).toMatch(/untracked working tree files would be overwritten/);

    rmSync(join(checkout, "b.txt"));
    expect(await sync.pull(checkout)).toMatchObject({ behind: 0, error: null });
  });

  it("has nothing to compare on a detached HEAD or a branch tracking nothing", async () => {
    const sync = createCheckoutSync(runGit);
    git(checkout, "checkout", "-q", "-b", "local-only");
    expect(await sync.status(checkout)).toBeNull();
    git(checkout, "checkout", "-q", "--detach");
    expect(await sync.status(checkout)).toBeNull();
  });

  it("shares one fetch between callers", async () => {
    const spy = vi.fn<RunGit>(runGit);
    const sync = createCheckoutSync(spy);
    await Promise.all([sync.status(checkout), sync.status(checkout), sync.status(checkout)]);
    expect(spy.mock.calls.filter(([, args]) => args[0] === "fetch")).toHaveLength(1);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { commitsSince, diffStates, fileAtCommit, fileOnDisk, readBranchDiff, toplevel } from "./git";
import { parseDiff } from "./items";
import { ABSENT, changedPaths } from "./stale";
import { makeRepo } from "./testing/repo";

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
});
async function repo() {
  const r = await makeRepo();
  cleanups.push(r.cleanup);
  r.run("checkout", "-q", "-b", "feature");
  return r;
}

describe("readBranchDiff", () => {
  it("includes committed, uncommitted, and untracked changes against the merge base", async () => {
    const r = await repo();
    r.write("src/widget.ts", "export const widget = 2;\n");
    r.run("commit", "-qam", "Change widget");
    r.write("src/gadget.ts", "export const gadget = 1;\n");
    r.run("add", "src/gadget.ts");
    r.run("commit", "-qm", "Add gadget");
    r.write("src/gadget.ts", "export const gadget = 2;\n");
    r.write("docs/read me.md", "untracked\n");

    const branch = await readBranchDiff(r.root, "main");
    const files = parseDiff(branch.diffText);
    expect(files.map((f) => [f.path, f.status]).sort()).toEqual([
      ["docs/read me.md", "added"],
      ["src/gadget.ts", "added"],
      ["src/widget.ts", "modified"],
    ]);
    expect(branch.changedPaths.sort()).toEqual(["docs/read me.md", "src/gadget.ts", "src/widget.ts"]);
    expect(branch.baseSha).toBe(r.run("rev-parse", "main").trim());
  });

  it("includes untracked files on a branch with nothing committed", async () => {
    const r = await repo();
    r.write("notes.txt", "hello\n");
    const files = parseDiff((await readBranchDiff(r.root, "main")).diffText);
    expect(files.map((f) => f.path)).toEqual(["notes.txt"]);
  });

  it("returns an empty diff for a branch with no changes", async () => {
    const r = await repo();
    expect((await readBranchDiff(r.root, "main")).diffText).toBe("");
  });
});

describe("file states", () => {
  it("reads a file on disk and at a commit, and reports absence", async () => {
    const r = await repo();
    const head = r.run("rev-parse", "HEAD").trim();
    r.write("src/widget.ts", "export const widget = 3;\n");
    const onDisk = await fileOnDisk(r.root, "src/widget.ts");
    const atHead = await fileAtCommit(r.root, head, "src/widget.ts");
    expect(onDisk.text).toBe("export const widget = 3;\n");
    expect(atHead.text).toBe("export const widget = 1;\n");
    expect(changedPaths(["src/widget.ts"], new Map([["src/widget.ts", atHead]]), new Map([["src/widget.ts", onDisk]]))).toEqual(["src/widget.ts"]);
    expect(await fileOnDisk(r.root, "missing.ts")).toEqual(ABSENT);
    expect(await fileAtCommit(r.root, head, "missing.ts")).toEqual(ABSENT);
  });

  it("diffs two states into bare hunks", async () => {
    const patch = await diffStates({ hash: "a", text: "one\n" }, { hash: "b", text: "two\n" });
    expect(patch).toBe("@@ -1 +1 @@\n-one\n+two\n");
    expect(await diffStates({ hash: "a", text: null }, { hash: "b", text: null })).toBe("");
  });
});

describe("commitsSince", () => {
  it("counts commits since an ancestor", async () => {
    const r = await repo();
    const old = r.run("rev-parse", "HEAD").trim();
    r.write("a.txt", "1\n");
    r.run("add", "a.txt");
    r.run("commit", "-qm", "One");
    expect(await commitsSince(r.root, old)).toBe(1);
  });

  it("commitsSince returns null after a rewrite", async () => {
    const r = await repo();
    r.write("a.txt", "1\n");
    r.run("add", "a.txt");
    r.run("commit", "-qm", "One");
    const old = r.run("rev-parse", "HEAD").trim();
    r.run("commit", "-q", "--amend", "-m", "One, reworded");
    expect(await commitsSince(r.root, old)).toBeNull();
  });
});

describe("toplevel", () => {
  it("finds the repository root, or null outside one", async () => {
    const r = await repo();
    expect(await toplevel(`${r.root}/src`)).toMatch(/reviewmaxx-test-/);
    expect(await toplevel("/")).toBeNull();
  });
});

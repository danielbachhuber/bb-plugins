import { describe, expect, it } from "vitest";
import { githubPath, isMarked, sameDiff, syncMode, syncedProgress, type GithubState } from "./github";
import type { DiffFileEntry } from "./marks";

const pull = (files: GithubState["files"]): GithubState => ({
  number: 42,
  url: "https://github.com/acme/widgets/pull/42",
  files,
});

const entry = (path: string, additions: number, deletions: number, binary = false): DiffFileEntry => ({
  path,
  previousPath: null,
  changeKind: "modified",
  additions,
  deletions,
  binary,
});

describe("githubPath", () => {
  it("is the path itself for an ordinary file", () => {
    expect(githubPath("src/a.ts")).toBe("src/a.ts");
  });

  it("is the current path for a rename", () => {
    expect(githubPath("src/old.ts -> src/new.ts")).toBe("src/new.ts");
  });
});

describe("sameDiff", () => {
  const file = { path: "a.ts", additions: 8, deletions: 4, viewed: false };

  it("matches on the counts", () => {
    expect(sameDiff(file, "+8 -4")).toBe(true);
    expect(sameDiff(file, "+8 -5")).toBe(false);
  });

  it("matches a binary header's `none` to GitHub's zero counts", () => {
    expect(sameDiff({ ...file, additions: 0, deletions: 0 }, "none")).toBe(true);
    expect(sameDiff(file, "none")).toBe(false);
  });
});

describe("syncMode", () => {
  it("is none without a pull request", () => {
    expect(syncMode(null, { path: "a.ts", fingerprint: "+1 -1" })).toEqual({ kind: "none" });
  });

  it("is local for a file the pull request does not have", () => {
    expect(syncMode(pull([]), { path: "a.ts", fingerprint: "+1 -1" })).toEqual({ kind: "local", number: 42 });
  });

  it("is local when the counts differ", () => {
    const github = pull([{ path: "a.ts", additions: 1, deletions: 0, viewed: true }]);
    expect(syncMode(github, { path: "a.ts", fingerprint: "+1 -1" }).kind).toBe("local");
  });
});

describe("isMarked", () => {
  const github = pull([{ path: "a.ts", additions: 1, deletions: 1, viewed: false }]);

  it("takes GitHub's state over a local mark when the diff matches", () => {
    expect(isMarked({ "a.ts": "+1 -1" }, github, { path: "a.ts", fingerprint: "+1 -1" })).toBe(false);
  });

  it("takes the local mark when the diff differs", () => {
    expect(isMarked({ "a.ts": "+2 -1" }, github, { path: "a.ts", fingerprint: "+2 -1" })).toBe(true);
  });
});

describe("syncedProgress", () => {
  it("counts GitHub's marks and local marks together", () => {
    const github = pull([
      { path: "a.ts", additions: 1, deletions: 1, viewed: true },
      { path: "b.ts", additions: 2, deletions: 0, viewed: false },
    ]);
    const progress = syncedProgress({ "c.ts": "+3 -3" }, github, [
      entry("a.ts", 1, 1),
      entry("b.ts", 2, 0),
      entry("c.ts", 3, 3),
    ]);
    expect(progress).toEqual({ viewed: 2, total: 3 });
  });

  it("counts a local mark on a binary image stored as `none`", () => {
    const progress = syncedProgress({ "logo.png": "none" }, null, [entry("logo.png", 0, 0, true)]);
    expect(progress).toEqual({ viewed: 1, total: 1 });
  });
});

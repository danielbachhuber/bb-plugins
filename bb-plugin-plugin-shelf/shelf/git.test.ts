import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { commitsSince, fetchMain, findCheckout, readIndex, remoteTags, runGit } from "./git";
import { makeTestRepo } from "./test-repo";

let origin: string;
let clone: string;

beforeAll(() => {
  ({ clone, origin } = makeTestRepo());
});

describe("findCheckout", () => {
  it("finds the root and origin from a plugin directory", async () => {
    const result = await findCheckout(runGit, join(clone, "bb-plugin-widgets"));
    expect(result).toEqual({ root: expect.stringContaining("work"), originUrl: origin });
  });

  it("explains a directory with no plugin index", async () => {
    const bare = mkdtempSync(join(tmpdir(), "shelf-none-"));
    execFileSync("git", ["init", "--quiet"], { cwd: bare });
    expect(await findCheckout(runGit, bare)).toEqual({
      error: expect.stringContaining(".bb/plugins.json"),
    });
  });

  it("explains a directory outside any checkout", async () => {
    const plain = mkdtempSync(join(tmpdir(), "shelf-plain-"));
    expect(await findCheckout(runGit, plain)).toEqual({
      error: expect.stringContaining("not inside a git checkout"),
    });
  });
});

describe("readIndex", () => {
  it("reads names, descriptions, and versions, falling back to the id", async () => {
    const plugins = await readIndex(clone, new Set(["widgets"]));
    expect(plugins).toEqual([
      { id: "widgets", dir: "bb-plugin-widgets", name: "Widgets", description: "Arranges widgets.", version: "0.1.0", installed: true },
      { id: "gadgets", dir: "bb-plugin-gadgets", name: "gadgets", description: "", version: "0.1.0", installed: false },
    ]);
  });
});

describe("remoteTags", () => {
  it("lists only tags that were pushed", async () => {
    expect(await remoteTags(runGit, clone)).toEqual(["widgets/v0.1.0"]);
  });
});

describe("commitsSince", () => {
  it("lists the real commits since the tag, newest first, without the merge", async () => {
    await fetchMain(runGit, clone);
    const commits = await commitsSince(runGit, clone, "widgets/v0.1.0", "bb-plugin-widgets");
    expect(commits.map((c) => c.subject)).toEqual(["Describe widgets", "Draw widgets"]);
    expect(commits[0]!.files).toEqual(["bb-plugin-widgets/README.md"]);
    expect(commits[0]!.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(commits[0]!.date).toMatch(/^2026-09-01T/);
  });

  it("lists nothing for a plugin untouched since the tag", async () => {
    expect(await commitsSince(runGit, clone, "widgets/v0.1.0", "bb-plugin-gadgets")).toEqual([]);
  });
});

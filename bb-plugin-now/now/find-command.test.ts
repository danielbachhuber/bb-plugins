import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { commandCandidates, findCommand } from "./find-command.js";

describe("commandCandidates", () => {
  test("keeps a path as given", () => {
    expect(commandCandidates("/opt/bin/gws", "/usr/bin", "/home/octocat")).toEqual(["/opt/bin/gws"]);
  });

  test("tries PATH first, then the usual install directories", () => {
    expect(commandCandidates("gws", "/usr/bin:/bin", "/home/octocat")).toEqual([
      "/usr/bin/gws",
      "/bin/gws",
      "/opt/homebrew/bin/gws",
      "/usr/local/bin/gws",
      "/home/octocat/.local/bin/gws",
      "/home/octocat/bin/gws",
    ]);
  });

  test("does not try a directory twice", () => {
    expect(commandCandidates("gh", "/opt/homebrew/bin", "/home/octocat")[1]).toBe("/usr/local/bin/gh");
  });
});

describe("findCommand", () => {
  test("finds a CLI that is only in a fallback directory", () => {
    const home = mkdtempSync(join(tmpdir(), "find-command-"));
    mkdirSync(join(home, "bin"));
    const gws = join(home, "bin", "find-command-test-cli");
    writeFileSync(gws, "#!/bin/sh\n");
    chmodSync(gws, 0o755);
    expect(findCommand("find-command-test-cli", "/nonexistent", home)).toBe(gws);
  });

  test("returns the name unchanged when nothing matches", () => {
    expect(findCommand("no-such-cli-anywhere", "/nonexistent", "/nonexistent")).toBe("no-such-cli-anywhere");
  });
});

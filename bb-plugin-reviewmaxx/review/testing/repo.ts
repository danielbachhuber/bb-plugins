// A throwaway git repository under the OS temp directory, for tests.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "reviewmaxx-test-"));
  const run = (...args: string[]) =>
    execFileSync(
      "git",
      ["-C", root, "-c", "user.name=Octocat", "-c", "user.email=octocat@example.com", "-c", "commit.gpgsign=false", ...args],
      { encoding: "utf8" },
    );
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  run("init", "-q", "-b", "main");
  write("src/widget.ts", "export const widget = 1;\n");
  run("add", ".");
  run("commit", "-q", "-m", "Start");
  return {
    root,
    run,
    write,
    remove: (file: string) => rmSync(path.join(root, file)),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

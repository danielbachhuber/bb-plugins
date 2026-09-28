// A throwaway checkout with a bare origin, shaped like a plugins repository:
// two plugins, one pushed release tag, a merge commit, and a tag that was
// created locally and never pushed. Shared by the git and server tests.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tick = 0;

function git(cwd: string, ...args: string[]): string {
  // Each commit a minute apart, so log order never depends on two commits
  // landing in the same second.
  tick += 1;
  const date = new Date(Date.UTC(2026, 8, 1, 10, tick)).toISOString();
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

function write(root: string, path: string, text: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

export function makeTestRepo(): { clone: string; origin: string } {
  const base = mkdtempSync(join(tmpdir(), "shelf-git-"));
  const origin = join(base, "origin.git");
  const clone = join(base, "work");
  git(base, "init", "--quiet", "--bare", "-b", "main", origin);
  git(base, "clone", "--quiet", origin, clone);
  git(clone, "config", "user.email", "octocat@example.com");
  git(clone, "config", "user.name", "Octocat");
  git(clone, "config", "commit.gpgsign", "false");
  git(clone, "config", "tag.gpgsign", "false");
  write(clone, ".bb/plugins.json", JSON.stringify({
    plugins: [
      { name: "widgets", source: "./bb-plugin-widgets" },
      { name: "gadgets", source: "./bb-plugin-gadgets" },
    ],
  }));
  write(clone, "bb-plugin-widgets/package.json", JSON.stringify({
    version: "0.1.0",
    bb: { name: "Widgets", description: "Arranges widgets." },
  }));
  write(clone, "bb-plugin-gadgets/package.json", JSON.stringify({ version: "0.1.0" }));
  git(clone, "add", ".");
  git(clone, "commit", "--quiet", "-m", "Add widgets and gadgets");
  git(clone, "tag", "widgets/v0.1.0");
  write(clone, "bb-plugin-widgets/app.tsx", "export {};\n");
  git(clone, "add", ".");
  git(clone, "commit", "--quiet", "-m", "Draw widgets");
  // A side branch merged back, so a merge commit also touches the plugin.
  git(clone, "checkout", "--quiet", "-b", "side");
  write(clone, "bb-plugin-widgets/README.md", "# Widgets\n");
  git(clone, "add", ".");
  git(clone, "commit", "--quiet", "-m", "Describe widgets");
  git(clone, "checkout", "--quiet", "main");
  git(clone, "merge", "--quiet", "--no-ff", "side", "-m", "Merge side");
  git(clone, "push", "--quiet", "origin", "main", "widgets/v0.1.0");
  git(clone, "tag", "widgets/v0.1.1"); // never pushed
  return { clone, origin };
}

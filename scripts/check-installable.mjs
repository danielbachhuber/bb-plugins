// Installs each plugin the way bb installs one from a git marketplace entry,
// and reports the ones that fail.
//
// bb clones the repository, deletes the plugin directory's npm config, runs
// `npm install --prefix <plugin dir> --omit=dev --ignore-scripts`, and builds
// the plugin from source. Nothing is installed at the root or in a shared
// library, so an import that only resolves through the workspace's root
// node_modules works here in the checkout and fails for everyone else.
//
//   node scripts/check-installable.mjs                 # every plugin, at HEAD
//   node scripts/check-installable.mjs --published     # plugins with a release tag
//   node scripts/check-installable.mjs impromptu-ui    # one plugin
//   node scripts/check-installable.mjs --ref impromptu-ui/v0.1.0 impromptu-ui
//
// It installs from a commit, not the working tree, so commit before checking.
// A plugin counts as published once it has a `<name>/v*` tag, which is what a
// marketplace entry's range selects. The pre-push hook in .githooks/ runs this
// for each such tag being pushed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let ref = "HEAD";
const refAt = args.indexOf("--ref");
if (refAt !== -1) {
  ref = args[refAt + 1];
  args.splice(refAt, 2);
}

const publishedAt = args.indexOf("--published");
const publishedOnly = publishedAt !== -1;
if (publishedOnly) args.splice(publishedAt, 1);
const tagged = new Set(
  execFileSync("git", ["-C", root, "tag", "--list", "*/v*"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((tag) => tag.slice(0, tag.lastIndexOf("/v"))),
);

const index = JSON.parse(readFileSync(path.join(root, ".bb/plugins.json"), "utf8"));
const plugins = index.plugins.filter(
  (p) => (args.length === 0 || args.includes(p.name)) && (!publishedOnly || tagged.has(p.name)),
);
if (plugins.length === 0) {
  console.error(`No plugin named ${args.join(", ")} in .bb/plugins.json`);
  process.exit(1);
}

const failed = [];
for (const plugin of plugins) {
  const work = mkdtempSync(path.join(tmpdir(), `bb-install-${plugin.name}-`));
  try {
    // A fresh copy for each plugin, so one plugin's install cannot help another's.
    execFileSync("sh", ["-c", `git -C "$1" archive "$2" | tar -x -C "$3"`, "sh", root, ref, work]);
    const dir = path.join(work, plugin.source);
    for (const name of [".npmrc", ".yarnrc", ".yarnrc.yml"]) rmSync(path.join(dir, name), { force: true });
    run("npm", ["install", "--prefix", dir, "--ignore-scripts", "--omit=dev", "--omit=optional", "--no-audit", "--no-fund"], dir);
    run("bb", ["plugin", "build", "."], dir);
    console.log(`ok    ${plugin.name}`);
  } catch (error) {
    failed.push(plugin.name);
    console.log(`FAIL  ${plugin.name}`);
    console.log(indent(String(error.stderr || error.stdout || error.message).trim().split("\n").slice(-12).join("\n")));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (failed.length > 0) {
  console.log(`\n${failed.length} of ${plugins.length} failed to install: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\nAll ${plugins.length} installed.`);

function run(command, commandArgs, cwd) {
  execFileSync(command, commandArgs, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
}

function indent(text) {
  return text.replace(/^/gm, "      ");
}

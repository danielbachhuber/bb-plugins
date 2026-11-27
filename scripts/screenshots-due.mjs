#!/usr/bin/env node
// Lists the unpublished plugins whose screenshots are due for a capture.
//
//   node scripts/screenshots-due.mjs                 every unpublished plugin
//   node scripts/screenshots-due.mjs tokenomics now  only these
//   node scripts/screenshots-due.mjs --days 14       a different age, 7 by default
//
// A published plugin, one with a `<name>/v*` tag, is captured at each
// release. An unpublished one has no releases, so it is due once its last
// capture is at least `--days` old and a commit has changed its directory
// since. A plugin with stories and no capture yet is due too. It prints one
// line per due plugin, and nothing when none is.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const args = process.argv.slice(2);
const daysAt = args.indexOf("--days");
const days = daysAt === -1 ? 7 : Number(args.splice(daysAt, 2)[1]);
if (!Number.isFinite(days) || days < 0) {
  console.error("--days needs a number of days, such as `--days 14`.");
  process.exit(1);
}
const names = args.map((name) => name.replace(/^bb-plugin-/, ""));

/** The screenshots checkout, found the way scripts/screenshots.mjs finds it. */
function screenshotsDir() {
  const envPath = join(repoRoot, ".env");
  const fromEnv = existsSync(envPath)
    ? readFileSync(envPath, "utf8").match(/^\s*BB_PLUGINS_SCREENSHOTS_DIR\s*=\s*["']?(.*?)["']?\s*$/m)?.[1]
    : undefined;
  const configured = process.env.BB_PLUGINS_SCREENSHOTS_DIR ?? fromEnv ?? "../bb-plugins-screenshots";
  const expanded = configured === "~" || configured.startsWith("~/") ? join(homedir(), configured.slice(1)) : configured;
  return resolve(repoRoot, expanded);
}

const outDir = screenshotsDir();
if (!existsSync(join(outDir, ".git"))) {
  console.error(`No git checkout at ${outDir}. Clone bb-plugins-screenshots there, or set BB_PLUGINS_SCREENSHOTS_DIR in .env.`);
  process.exit(1);
}

const tagged = new Set(git(repoRoot, "tag", "--list", "*/v*").split("\n").filter(Boolean).map((tag) => tag.split("/v")[0]));
const plugins = JSON.parse(readFileSync(join(repoRoot, ".bb/plugins.json"), "utf8")).plugins.map((plugin) => ({
  name: plugin.name,
  dir: plugin.source.replace(/^\.\//, ""),
}));
const unknown = names.filter((name) => !plugins.some((plugin) => plugin.name === name));
if (unknown.length) {
  console.error(`Not a plugin in .bb/plugins.json: ${unknown.join(", ")}.`);
  process.exit(1);
}

const now = Date.now();
for (const { name, dir } of plugins) {
  if (names.length ? !names.includes(name) : tagged.has(name)) continue;
  if (tagged.has(name)) {
    console.log(`${name}: published, so it is captured at each release.`);
    continue;
  }
  if (!git(repoRoot, "ls-files", "--", `${dir}/**/*.stories.tsx`, `${dir}/*.stories.tsx`)) continue;
  const [capturedAt, ...body] = git(outDir, "log", "-1", "--format=%ct%n%B", "--", name).split("\n");
  const sha = body.join("\n").match(/danielbachhuber\/bb-plugins@([0-9a-f]{40})/)?.[1];
  if (!sha) {
    console.log(`${name}: has stories and no capture yet.`);
    continue;
  }
  const age = Math.floor((now - Number(capturedAt) * 1000) / 86_400_000);
  let commits;
  try {
    commits = Number(git(repoRoot, "rev-list", "--count", `${sha}..HEAD`, "--", dir));
  } catch {
    console.log(`${name}: last captured ${age} days ago, from a commit not in this history.`);
    continue;
  }
  if (age >= days && commits > 0) {
    console.log(`${name}: last captured ${age} days ago, from ${sha.slice(0, 7)}, with ${commits} commit${commits === 1 ? "" : "s"} to ${dir} since.`);
  }
}

#!/usr/bin/env node
//
// Run bb's own Ladle against the stories in this checkout.
//
// Nothing here installs Ladle, Vite, or Tailwind. The stories render bb's real
// components with bb's real stylesheet, so they use the copies bb already has
// installed, at the versions bb's stylesheet was written for. That makes a bb
// checkout a prerequisite: BB_SOURCE_DIR in .env, defaulting to ~/projects/bb.
//
// Usage:
//   node scripts/ladle.mjs serve [ladle options]
//   node scripts/ladle.mjs build [ladle options]

import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...rest] = process.argv.slice(2);

if (command !== "serve" && command !== "build") {
  console.error("usage: node scripts/ladle.mjs serve|build [ladle options]");
  process.exit(2);
}

/** KEY=value lines only; enough for one path, and no dependency to install. */
function readDotEnv(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

function expandHome(path) {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

const configured =
  process.env.BB_SOURCE_DIR ?? readDotEnv(join(repoRoot, ".env")).BB_SOURCE_DIR ?? "~/projects/bb";
const configuredDir = resolve(repoRoot, expandHome(configured));
// Real path, because Vite reports importers by their real paths and the Vite
// config tells bb's files from this checkout's by prefix.
const bbSourceDir = existsSync(configuredDir) ? realpathSync(configuredDir) : configuredDir;
const bbAppDir = join(bbSourceDir, "apps/app");
const ladleBin = join(bbAppDir, "node_modules/.bin/ladle");

if (!existsSync(join(bbAppDir, ".ladle/components.tsx"))) {
  console.error(
    `No bb checkout at ${bbSourceDir}. Set BB_SOURCE_DIR in .env to the directory you cloned bb into.`,
  );
  process.exit(1);
}
if (!existsSync(ladleBin)) {
  console.error(`bb at ${bbSourceDir} has no Ladle installed. Run \`pnpm install\` there first.`);
  process.exit(1);
}

// The config files import bb's through this link, so they can use static
// relative paths wherever the checkout lives. It is gitignored.
const link = join(repoRoot, ".ladle/bb-source");
let current = null;
try {
  if (lstatSync(link).isSymbolicLink()) current = readlinkSync(link);
} catch {}
if (current !== bbSourceDir) {
  rmSync(link, { force: true });
  symlinkSync(bbSourceDir, link);
}

// Ladle runs from bb's app directory, so Vite's root is bb's and every bare
// import (React above all) resolves to bb's one installed copy.
const child = spawn(
  ladleBin,
  [
    command,
    "--config",
    join(repoRoot, ".ladle"),
    "--viteConfig",
    join(repoRoot, ".ladle/vite.config.mts"),
    ...rest,
  ],
  {
    cwd: bbAppDir,
    stdio: "inherit",
    env: { ...process.env, BB_SOURCE_DIR: bbSourceDir, BB_PLUGINS_DIR: repoRoot },
  },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

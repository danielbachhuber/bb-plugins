// Runs after every `npm install` at the root, as its postinstall script.
//
// npm hoists a workspace's `file:../<dir>` dependencies, and its dependencies
// on another workspace by name (the component library, which is published to
// npm for marketplace installs), to the root node_modules, which Node, Vite,
// and tsc all find by walking up. bb's app build does not: it reads a
// dependency's `bb.pluginTailwindContent` only from
// `<plugin>/node_modules/<name>/package.json`, so a hoisted component library
// contributes no classes and its colors silently disappear from the panel.
//
// This links each such dependency into the workspace's own node_modules as
// well. The link points at the same directory the hoisted one does, so every
// import still resolves to one copy, and React stays single.
//
// npm deletes these links whenever it reinstalls without running this
// postinstall, and a build without them succeeds with the classes missing. So
// sync.sh and the build command in AGENTS.md run it before every build.
//
// Usage:
//   link-workspace-deps.mjs           create or repair every link
//   link-workspace-deps.mjs --check   print each missing link as
//                                     `<workspace dir>\t<package name>`, change
//                                     nothing, and exit 1 if there are any
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checkOnly = process.argv.includes("--check");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const workspaceDirs = new Map();
for (const dir of rootPkg.workspaces) {
  const manifest = path.join(root, dir, "package.json");
  if (existsSync(manifest)) workspaceDirs.set(JSON.parse(readFileSync(manifest, "utf8")).name, dir);
}

const missing = [];
for (const entry of readdirSync(root, { withFileTypes: true })) {
  const manifest = path.join(root, entry.name, "package.json");
  if (!entry.isDirectory() || entry.name === "node_modules" || !existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec !== "string") continue;
    const dir = spec.startsWith("file:../") ? spec.slice("file:../".length) : workspaceDirs.get(name);
    if (dir === undefined) continue;
    const link = path.join(root, entry.name, "node_modules", name);
    const target = path.relative(path.dirname(link), path.join(root, dir));
    if (isSymlink(link) && readlinkSync(link) === target) continue;
    if (checkOnly) {
      missing.push(`${entry.name}\t${name}`);
      continue;
    }
    if (existsSync(link) || isSymlink(link)) {
      rmSync(link, { recursive: true, force: true });
    }
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(target, link, "junction");
  }
}

if (missing.length > 0) {
  console.log(missing.join("\n"));
  process.exit(1);
}

function isSymlink(file) {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

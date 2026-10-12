// Runs after every `npm install` at the root, as its postinstall script.
//
// npm hoists a workspace's `file:../<dir>` dependencies to the root
// node_modules, which Node, Vite, and tsc all find by walking up. bb's app
// build does not: it reads a dependency's `bb.pluginTailwindContent` only from
// `<plugin>/node_modules/<name>/package.json`, so a hoisted component-library
// contributes no classes and its colors silently disappear from the panel.
//
// This links each such dependency into the workspace's own node_modules as
// well. The link points at the same directory the hoisted one does, so every
// import still resolves to one copy, and React stays single.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const entry of readdirSync(root, { withFileTypes: true })) {
  const manifest = path.join(root, entry.name, "package.json");
  if (!entry.isDirectory() || entry.name === "node_modules" || !existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec !== "string" || !spec.startsWith("file:../")) continue;
    const link = path.join(root, entry.name, "node_modules", name);
    const target = path.relative(path.dirname(link), path.join(root, spec.slice("file:../".length)));
    if (existsSync(link) || isSymlink(link)) {
      if (isSymlink(link) && readlinkSync(link) === target) continue;
      rmSync(link, { recursive: true, force: true });
    }
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(target, link, "junction");
  }
}

function isSymlink(file) {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

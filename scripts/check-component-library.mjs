// Checks that a plugin's release will get the component library it was built
// against here.
//
// A marketplace install gets `@danielbachhuber/bb-plugin-component-library`
// from npm, at the newest version the plugin's range allows. In this checkout
// npm links the local `component-library/` instead, so a plugin can import an
// entry, or rely on a change to one, that npm does not have yet. It builds
// here and fails, or behaves differently, for everyone else.
//
//   node scripts/check-component-library.mjs now
//   node scripts/check-component-library.mjs now review-sweep
//   node scripts/check-component-library.mjs          # every plugin that uses it
//
// For each plugin it reports:
// - entries the plugin imports that the published version does not export
// - entries whose files here differ from the published tarball, following
//   each entry's relative imports, such as date-range's import of calendar
//
// It reads the working tree, not a commit, and exits 1 when either list is
// not empty. The publish-plugin-update skill runs it before bumping a version.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIBRARY = "@danielbachhuber/bb-plugin-component-library";
const SOURCE = /\.(ts|tsx|mts|js|mjs|jsx)$/;
// Tests and stories are not part of the build bb runs on install.
const NOT_BUILT = /\.(test|stories)\.[a-z]+$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "explore"]);

/** The specifiers a source file imports or re-exports. */
export function importSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

/** The library entries (`sync-status`, `parse-day`) a set of files imports. */
export function libraryEntries(sources) {
  const entries = new Set();
  const prefix = `${LIBRARY}/`;
  for (const source of sources) {
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith(prefix)) entries.add(specifier.slice(prefix.length));
    }
  }
  return [...entries].sort();
}

/**
 * Compares the entries a plugin uses with the published package.
 *
 * `local` and `published` each give `exports` (the package.json map) and
 * `read(file)`, which returns a file's contents relative to the package root,
 * or null when it is absent.
 */
export function compareEntries(entries, local, published) {
  const missing = [];
  const changed = new Map();
  for (const entry of entries) {
    const key = `./${entry}`;
    if (!local.exports?.[key]) continue; // not a local entry either; the build will say so
    if (!published.exports?.[key]) {
      missing.push(entry);
      continue;
    }
    for (const file of entryFiles(local.exports[key], local.read)) {
      if (local.read(file) !== published.read(file)) {
        if (!changed.has(entry)) changed.set(entry, []);
        changed.get(entry).push(file);
      }
    }
  }
  return { missing, changed: [...changed].map(([entry, files]) => ({ entry, files })) };
}

/** An entry's file and every file it reaches through relative imports. */
export function entryFiles(target, read) {
  const seen = new Set();
  const queue = [normalize(target)];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    const source = read(file);
    if (source === null) continue;
    seen.add(file);
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const base = normalize(path.posix.join(path.posix.dirname(file), specifier));
      const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
        (candidate) => read(candidate) !== null,
      );
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

function normalize(file) {
  return path.posix.normalize(file).replace(/^\.\//, "");
}

export function formatReport(plugin, result) {
  const lines = [];
  if (result.missing.length === 0 && result.changed.length === 0) {
    lines.push(`ok    ${plugin.name}: npm's ${result.version} has every entry it uses (${result.entries.join(", ")})`);
    return lines.join("\n");
  }
  lines.push(`STOP  ${plugin.name}: needs a component library newer than ${result.version} on npm`);
  for (const entry of result.missing) lines.push(`      ${entry}: not in ${result.version}`);
  for (const { entry, files } of result.changed) {
    lines.push(`      ${entry}: changed since ${result.version} (${files.join(", ")})`);
  }
  return lines.join("\n");
}

// --- I/O below: the checkout, npm, and the published tarball. ---

function readPackageFile(root) {
  return (file) => {
    const full = path.join(root, file);
    return existsSync(full) && statSync(full).isFile() ? readFileSync(full, "utf8") : null;
  };
}

function pluginSources(dir) {
  const sources = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sources.push(...pluginSources(full));
    else if (SOURCE.test(name) && !NOT_BUILT.test(name)) sources.push(readFileSync(full, "utf8"));
  }
  return sources;
}

function fetchPublished(range, work) {
  mkdirSync(work, { recursive: true });
  // The newest version the plugin's range allows, which is what bb installs.
  const versions = JSON.parse(npm(["view", `${LIBRARY}@${range}`, "version", "--json"]));
  const version = [versions].flat().at(-1);
  if (!version) throw new Error(`no published ${LIBRARY} matches ${range}`);
  const [packed] = JSON.parse(npm(["pack", `${LIBRARY}@${version}`, "--pack-destination", work, "--json"]));
  execFileSync("tar", ["-xzf", path.join(work, packed.filename), "-C", work]);
  const root = path.join(work, "package");
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  return { version, exports: manifest.exports, read: readPackageFile(root) };
}

function npm(args) {
  return execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const index = JSON.parse(readFileSync(path.join(repo, ".bb/plugins.json"), "utf8"));
  const unknown = args.filter((name) => !index.plugins.some((p) => p.name === name));
  if (unknown.length > 0) {
    console.error(`No plugin named ${unknown.join(", ")} in .bb/plugins.json`);
    process.exit(2);
  }

  const libraryRoot = path.join(repo, "component-library");
  const libraryManifest = JSON.parse(readFileSync(path.join(libraryRoot, "package.json"), "utf8"));
  const local = { exports: libraryManifest.exports, read: readPackageFile(libraryRoot) };

  const work = mkdtempSync(path.join(tmpdir(), "bb-component-library-"));
  const published = new Map(); // range -> published package, fetched once each
  let stopped = 0;
  try {
    for (const plugin of index.plugins) {
      if (args.length > 0 && !args.includes(plugin.name)) continue;
      const dir = path.join(repo, plugin.source);
      const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
      const range = manifest.dependencies?.[LIBRARY];
      if (!range) {
        if (args.length > 0) console.log(`ok    ${plugin.name}: does not depend on ${LIBRARY}`);
        continue;
      }
      if (range.startsWith("file:")) {
        console.log(`STOP  ${plugin.name}: depends on ${range}, which a marketplace install cannot resolve`);
        stopped++;
        continue;
      }
      if (!published.has(range)) {
        published.set(range, fetchPublished(range, path.join(work, String(published.size))));
      }
      const pkg = published.get(range);
      const entries = libraryEntries(pluginSources(dir));
      const result = { version: pkg.version, entries, ...compareEntries(entries, local, pkg) };
      console.log(formatReport(plugin, result));
      if (result.missing.length > 0 || result.changed.length > 0) stopped++;
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  if (stopped > 0) {
    console.log(`
Publish component-library before releasing ${stopped === 1 ? "this plugin" : "these plugins"}:

  cd component-library
  npm version minor --no-git-tag-version   # patch, when no entry was added
  npm publish

Then raise ${LIBRARY} in each plugin's package.json to the new version,
such as "^1.1.0", run npm install at the root, and commit.`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

#!/usr/bin/env node
// Screenshot every story into the bb-plugins-screenshots checkout and commit
// the result there, so each commit here has a picture of what it looked like
// without the images living in this repository's history.
//
//   npm run screenshots                 build, capture, commit, push
//   npm run screenshots -- --no-push    commit but leave it local
//   npm run screenshots -- --no-commit  capture only, to look before committing
//
// The checkout is BB_PLUGINS_SCREENSHOTS_DIR, from the environment or .env,
// and defaults to a sibling directory named bb-plugins-screenshots.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2));
const commit = !flags.has("--no-commit");
const push = commit && !flags.has("--no-push");

/** KEY=value lines only, the same reader scripts/ladle.mjs uses. */
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
  process.env.BB_PLUGINS_SCREENSHOTS_DIR ??
  readDotEnv(join(repoRoot, ".env")).BB_PLUGINS_SCREENSHOTS_DIR ??
  "../bb-plugins-screenshots";
const outDir = resolve(repoRoot, expandHome(configured));

if (!existsSync(join(outDir, ".git"))) {
  console.error(
    `No git checkout at ${outDir}. Clone bb-plugins-screenshots there, or set BB_PLUGINS_SCREENSHOTS_DIR in .env.`,
  );
  process.exit(1);
}

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// Read before the build, so the commit names the source that was captured.
const sha = git(repoRoot, "rev-parse", "HEAD");
const subject = git(repoRoot, "log", "-1", "--format=%s");
const dirty = git(repoRoot, "status", "--porcelain") !== "";

const build = spawnSync("node", [join(repoRoot, "scripts/ladle.mjs"), "build"], {
  cwd: repoRoot,
  encoding: "utf8",
});
// Rollup warns about every icon module on stderr, so it is shown only when
// the build fails.
if (build.status !== 0) {
  process.stderr.write(build.stdout + build.stderr);
  process.exit(build.status ?? 1);
}

const buildDir = join(repoRoot, "build");
const stories = Object.keys(JSON.parse(readFileSync(join(buildDir, "meta.json"), "utf8")).stories);

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  let file = join(buildDir, path);
  if (!file.startsWith(buildDir) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(buildDir, "index.html");
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;

/** `review-sweep--review-list--rows` becomes `review-sweep/review-list--rows.png`. */
function outputPath(id) {
  const [plugin, ...rest] = id.split("--");
  return join(outDir, plugin, `${rest.join("--")}.png`);
}

const browser = await chromium.launch();
// Reduced motion, so a loading animation settles on the same frame each run
// rather than showing a new diff in the history every time.
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
  colorScheme: "light",
});

const failures = [];
const written = new Set();
for (const id of stories) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${base}/?story=${id}&mode=preview&theme=light`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  if (errors.length) {
    failures.push(`${id}: ${errors[0]}`);
  } else {
    const file = outputPath(id);
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    written.add(file);
    console.log(relative(outDir, file));
  }
  await page.close();
}
await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} stories failed to render, so nothing was committed:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

// A story that was removed or renamed takes its old image with it.
for (const entry of readdirSync(outDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
  for (const name of readdirSync(join(outDir, entry.name))) {
    const file = join(outDir, entry.name, name);
    if (name.endsWith(".png") && !written.has(file)) rmSync(file);
  }
}

if (!commit) process.exit(0);

git(outDir, "add", "-A");
if (git(outDir, "status", "--porcelain") === "") {
  console.log("\nNo visual changes.");
  process.exit(0);
}

const message = [
  `${sha.slice(0, 7)} ${subject}`,
  "",
  `danielbachhuber/bb-plugins@${sha}`,
  ...(dirty ? ["", "Captured with uncommitted changes in the bb-plugins checkout."] : []),
].join("\n");
execFileSync("git", ["commit", "-q", "-F", "-"], { cwd: outDir, input: message });
console.log(`\nCommitted ${git(outDir, "rev-parse", "--short", "HEAD")} in ${outDir}`);

if (push) {
  execFileSync("git", ["push", "-q", "-u", "origin", "HEAD"], { cwd: outDir, stdio: "inherit" });
}

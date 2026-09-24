#!/usr/bin/env node
// Screenshot every story into the bb-plugins-screenshots checkout and commit
// the result there, so each commit here has a picture of what it looked like
// without the images living in this repository's history.
//
//   npm run screenshots          build and capture, then list what changed
//   npm run screenshots:commit   commit the capture there and push it
//
// Two steps because that checkout's history is public. Every image a capture
// changed is read for private information while it is still only in the
// working tree, where a bad one can be thrown away without touching history.
//
// It also writes that checkout's READMEs: a table of the plugins at the root,
// and one per plugin directory with the plugin's bb.description and each
// story under a heading for its component, captioned with the doc comment
// above the story's export.
//
// The checkout is BB_PLUGINS_SCREENSHOTS_DIR, from the environment or .env,
// and defaults to a sibling directory named bb-plugins-screenshots.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commitMode = process.argv.includes("--commit");

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

// Which bb-plugins commit the capture in the working tree came from. Inside
// .git, so it is never committed itself.
const capturePath = join(outDir, ".git", "bb-plugins-capture.json");

if (commitMode) {
  if (!existsSync(capturePath)) {
    console.error("Nothing captured yet. Run `npm run screenshots` and read the images first.");
    process.exit(1);
  }
  const capture = JSON.parse(readFileSync(capturePath, "utf8"));
  git(outDir, "add", "-A");
  if (git(outDir, "status", "--porcelain") === "") {
    console.log("No visual changes to commit.");
    rmSync(capturePath);
    process.exit(0);
  }
  const message = [
    `${capture.sha.slice(0, 7)} ${capture.subject}`,
    "",
    `danielbachhuber/bb-plugins@${capture.sha}`,
    ...(capture.dirty ? ["", "Captured with uncommitted changes in the bb-plugins checkout."] : []),
  ].join("\n");
  execFileSync("git", ["commit", "-q", "-F", "-"], { cwd: outDir, input: message });
  rmSync(capturePath);
  execFileSync("git", ["push", "-q"], { cwd: outDir, stdio: "inherit" });
  console.log(`Committed and pushed ${git(outDir, "rev-parse", "--short", "HEAD")}.`);
  process.exit(0);
}

// Read before the build, so the commit names the source that was captured.
const sha = git(repoRoot, "rev-parse", "HEAD");
const subject = git(repoRoot, "log", "-1", "--format=%s");
const dirty = git(repoRoot, "status", "--porcelain") !== "";

const build = spawnSync("node", [join(repoRoot, "scripts/ladle.mjs"), "build"], {
  cwd: repoRoot,
  encoding: "utf8",
  // Rollup's warnings run to megabytes, past spawnSync's 1 MB default.
  maxBuffer: 256 * 1024 * 1024,
});
// Rollup warns about every icon module on stderr, so it is shown only when
// the build fails.
if (build.status !== 0) {
  if (build.error) console.error(build.error);
  process.stderr.write(build.stdout + build.stderr);
  process.exit(build.status ?? 1);
}

const buildDir = join(repoRoot, "build");
const storyMeta = JSON.parse(readFileSync(join(buildDir, "meta.json"), "utf8")).stories;
const stories = Object.keys(storyMeta);

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
// Reduced motion, and animations disabled at capture, so a loading animation
// or a spinner is on the same frame each run rather than showing a new diff
// in the history every time. The second catches what the first does not:
// `animate-spin` ignores the reduced-motion preference.
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
    await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
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

const REPO_URL = "https://github.com/danielbachhuber/bb-plugins";

/** The `/** ... *\/` comment directly above line `line` of `source`, as one paragraph. */
function docCommentAbove(source, line) {
  const lines = source.split("\n").slice(0, line - 1);
  if (!lines.at(-1)?.trim().endsWith("*/")) return "";
  const start = lines.findLastIndex((text) => text.trim().startsWith("/**"));
  if (start === -1) return "";
  return lines
    .slice(start)
    .join("\n")
    .replace(/^\s*\/\*\*|\*\/\s*$/g, "")
    .split("\n")
    .map((text) => text.replace(/^\s*\* ?/, "").trim())
    .filter(Boolean)
    .join(" ");
}

/** The first sentence, for the root table, where a paragraph-long description would crowd the row. */
function firstSentence(text) {
  return text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
}

// Stories grouped by output directory, in the order their files and exports
// are written, which is the order their authors meant them to be read in.
const plugins = new Map();
for (const id of stories) {
  const story = storyMeta[id];
  const dir = id.split("--")[0];
  const sourceDir = story.filePath.match(/(bb-plugin-[^/]+)\//)?.[1];
  if (!sourceDir) throw new Error(`Cannot tell which plugin ${story.filePath} belongs to.`);
  const file = join(repoRoot, sourceDir, story.filePath.split(`${sourceDir}/`)[1]);
  if (!plugins.has(dir)) {
    const bb = JSON.parse(readFileSync(join(repoRoot, sourceDir, "package.json"), "utf8")).bb ?? {};
    plugins.set(dir, { dir, sourceDir, name: bb.name ?? dir, description: bb.description ?? "", stories: [] });
  }
  plugins.get(dir).stories.push({
    id,
    name: story.name,
    section: story.levels.at(-1),
    file,
    line: story.locStart,
    caption: docCommentAbove(readFileSync(file, "utf8"), story.locStart),
  });
}

const GENERATED = "<!-- Written by `npm run screenshots` in bb-plugins. Edit the stories there, not this file. -->";

for (const plugin of plugins.values()) {
  plugin.stories.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const lines = [
    GENERATED,
    "",
    `# ${plugin.name}`,
    "",
    plugin.description,
    "",
    `Source: [\`${plugin.sourceDir}\`](${REPO_URL}/tree/main/${plugin.sourceDir})`,
  ];
  let section = null;
  for (const story of plugin.stories) {
    if (story.section !== section) {
      section = story.section;
      lines.push("", `## ${section}`);
    }
    const image = relative(join(outDir, plugin.dir), outputPath(story.id));
    lines.push("", `### ${story.name}`, "");
    if (story.caption) lines.push(story.caption, "");
    lines.push(`![${story.name}](${image})`);
  }
  writeFileSync(join(outDir, plugin.dir, "README.md"), `${lines.join("\n")}\n`);
}

// A plugin whose stories are all gone takes its README with it.
for (const entry of readdirSync(outDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".") || plugins.has(entry.name)) continue;
  rmSync(join(outDir, entry.name, "README.md"), { force: true });
}

const pluginRows = [...plugins.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((plugin) => {
    const count = plugin.stories.length;
    return `| [${plugin.name}](${plugin.dir}/README.md) | ${firstSentence(plugin.description)} | ${count} ${count === 1 ? "story" : "stories"} |`;
  });

writeFileSync(
  join(outDir, "README.md"),
  `${GENERATED}

# bb-plugins-screenshots

A picture of every story in [bb-plugins](${REPO_URL}),
taken after each commit there. The images live here so bb-plugins keeps a
small history while the visual history is still available.

## The plugins

| Plugin | What it does | Screenshots |
| --- | --- | --- |
${pluginRows.join("\n")}

Each directory is a plugin, named for the first part of its story titles.
Its README describes the plugin and shows each story, in the light theme,
under a heading for the part of the plugin it draws. Each commit message
starts with the bb-plugins commit it was taken from and links to it.

To see how a story changed, look at the history of its file:

\`\`\`sh
git log -p --follow review-sweep/review-list--baseline.png
\`\`\`

Nothing here is edited by hand. \`npm run screenshots\` in bb-plugins writes
every image and README, and removes the images of stories that no longer
exist. A plugin's description comes from its \`bb.description\`, and a
story's caption from the doc comment above it. Its changes are committed only
after each changed file has been checked for private information, as
AGENTS.md describes.
`,
);

writeFileSync(capturePath, JSON.stringify({ sha, subject, dirty }));

// -uall so a new plugin's images are listed one by one, not as a directory.
// Not through git(), whose trim would take the leading space of the first
// status line and, with it, the first character of that file's name.
const changed = execFileSync("git", ["status", "--porcelain", "-uall"], { cwd: outDir, encoding: "utf8" })
  .split("\n")
  .filter((line) => line && !line.slice(0, 2).includes("D"))
  .map((line) => line.slice(3));

if (changed.length === 0) {
  console.log("\nNo visual changes.");
  process.exit(0);
}
console.log(`\nNot committed. Read each of these for private information first:`);
for (const file of changed) console.log(`  ${join(outDir, file)}`);
console.log(
  `\nIf all are clean: npm run screenshots:commit` +
    `\nIf one is not: git -C ${outDir} checkout -- . && git -C ${outDir} clean -fd, then fix the fixture and capture again.`,
);

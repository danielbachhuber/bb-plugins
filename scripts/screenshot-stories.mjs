// Photograph a few stories into a directory of your choosing, for comparing
// design options without writing a Playwright script of your own:
//
//   npm run screenshots -- --story 'pr-sweep--*' --out /tmp/options [--theme dark]
//
// `--story` takes a story id or a glob over ids, and can be given more than
// once. Stories in explore/ directories are included. Each image is written to
// `<out>/<story id>.png`. Nothing is written to the screenshots checkout.
//
// It uses a Ladle server already serving this checkout, such as one from
// `npm run storybook`, and starts one of its own for the run when there is
// none. A running server can answer "Story not found" for a story its
// meta.json lists, so the stories it misses are photographed on a server
// started for the run, and the running one is left alone. A story that
// throws, that Vite cannot load, or that no server finds stops the run with
// the error and a non-zero exit, rather than saving the wrong picture or
// waiting for a timeout.
//
// `photograph` is shared with the full capture, so a picture taken here
// matches the one that capture commits.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, matchesGlob, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

// The size and settings the full capture photographs at. Reduced motion, and
// animations disabled at capture, so a loading animation or a spinner is on
// the same frame each run. The second catches what the first does not:
// `animate-spin` ignores the reduced-motion preference.
export const contextOptions = (theme) => ({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
  colorScheme: theme,
});

/**
 * Whether a loaded page is Ladle's "Story not found" page rather than the
 * story. Ladle draws it when the id is missing from the story list its page
 * loaded, which a running server can serve out of date (see `newStoryFiles`
 * in .ladle/vite.config.mts), and it would otherwise be photographed like any
 * other story.
 */
export async function isStoryNotFound(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".ladle-error-content h1")].some((h1) => h1.textContent.trim() === "Story not found"),
  );
}

/** A loaded story page as a PNG buffer. */
export async function photograph(page) {
  // A story that marks an element with `data-screenshot-frame` is photographed
  // at that element's size, for a small component that would otherwise sit in
  // the corner of a mostly empty page.
  const frame = page.locator("[data-screenshot-frame]").first();
  const framed = (await frame.count()) > 0;
  const shoot = () =>
    framed ? frame.screenshot({ animations: "disabled" }) : page.screenshot({ fullPage: true, animations: "disabled" });
  // A busy machine can catch a story before it has finished laying out, so it
  // is photographed again until two pictures in a row match.
  let image = await shoot();
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.waitForTimeout(100);
    const again = await shoot();
    if (again.equals(image)) break;
    image = again;
  }
  return image;
}

function parseArgs(argv) {
  const options = { patterns: [], out: null, theme: "light" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--story") options.patterns.push(argv[++i]);
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--theme") options.theme = argv[++i];
  }
  const problems = [];
  if (options.patterns.length === 0 || options.patterns.some((p) => !p)) problems.push("--story needs a story id or glob");
  if (!options.out) problems.push("--out needs a directory");
  if (!["light", "dark"].includes(options.theme)) problems.push("--theme is light or dark");
  if (problems.length) {
    console.error(`${problems.join("\n")}\n\nusage: npm run screenshots -- --story <id-or-glob> --out <dir> [--theme light|dark]`);
    process.exit(2);
  }
  return options;
}

/** Whether a Ladle server's stories are this checkout's, judged by where its first story's file is. */
async function servesThisCheckout(base, bbAppDir) {
  try {
    const response = await fetch(`${base}/meta.json`, { signal: AbortSignal.timeout(2000) });
    const story = Object.values((await response.json()).stories)[0];
    return Boolean(story) && resolve(bbAppDir, story.filePath).startsWith(repoRoot + sep);
  } catch {
    return false;
  }
}

/**
 * The address of a Ladle server already running for this checkout, if there
 * is one. Ladle runs from bb's app directory with this checkout's `.ladle` as
 * its config, so it is found by its command line, and its stories are checked
 * against this checkout, since every worktree of it runs the same command.
 */
async function runningServer() {
  let processes;
  try {
    processes = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  } catch {
    return null;
  }
  for (const line of processes.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!match || !/ladle.* serve /.test(match[2]) || !match[2].includes(join(repoRoot, ".ladle"))) continue;
    let cwd, ports;
    try {
      // Its working directory is bb's app directory, which its story paths are relative to.
      cwd = execFileSync("lsof", ["-a", "-p", match[1], "-d", "cwd", "-Fn"], { encoding: "utf8" }).match(/^n(.*)$/m)?.[1];
      const listening = execFileSync("lsof", ["-a", "-p", match[1], "-iTCP", "-sTCP:LISTEN", "-P", "-Fn"], { encoding: "utf8" });
      ports = [...new Set([...listening.matchAll(/^n.*:(\d+)$/gm)].map((m) => m[1]))];
    } catch {
      continue;
    }
    for (const port of ports) {
      const base = `http://localhost:${port}`;
      if (cwd && (await servesThisCheckout(base, cwd))) return base;
    }
  }
  return null;
}

/** Starts `npm run storybook`'s server for this run, and resolves with its address once it answers. */
function startServer() {
  const child = spawn("node", [join(repoRoot, "scripts/ladle.mjs"), "serve"], {
    cwd: repoRoot,
    // Its own process group, so stopping it stops the Ladle it starts too.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  };
  process.on("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
  let output = "";
  return new Promise((done, fail) => {
    const onData = async (chunk) => {
      output += chunk;
      const url = output.match(/served at (http:\/\/[^\s/]+)/)?.[1];
      if (!url) return;
      child.stdout.off("data", onData);
      // Ladle prints its address before Vite will answer.
      for (let i = 0; i < 100; i++) {
        if ((await fetch(`${url}/meta.json`).catch(() => null))?.ok) return done(url);
        await new Promise((wait) => setTimeout(wait, 200));
      }
      fail(new Error(`Ladle printed ${url} but never answered there.\n${output}`));
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) => fail(new Error(`Ladle stopped before it was ready (exit ${code}):\n${output}`)));
  });
}

/** The first story error on a page, as text: Vite's overlay, a module that would not load, or a story that threw. */
function watchForErrors(page) {
  let report;
  const failed = new Promise((resolveFailure) => (report = resolveFailure));
  // Vite pushes an import or transform error to the page as an overlay, whose
  // text is the message, the file and line, and the code around it.
  const overlay = () =>
    page
      .waitForFunction(() => document.querySelector("vite-error-overlay")?.shadowRoot?.querySelector(".message-body"), null, {
        timeout: 0,
      })
      .then(() =>
        page.evaluate(() => {
          const root = document.querySelector("vite-error-overlay").shadowRoot;
          return ["message-body", "file", "frame"]
            .map((name) => root.querySelector(`.${name}`)?.textContent.trim())
            .filter(Boolean)
            .join("\n");
        }),
      )
      .then(report, () => {});
  overlay();
  page.on("response", (response) => {
    // A module that fails to transform answers 404 or 500 a moment before its
    // overlay arrives. The overlay's message is the useful one, so it gets a
    // second to show up before the bare status is reported instead.
    if (response.status() >= 400 && /\/(@fs|@id|src|node_modules)\//.test(response.url())) {
      setTimeout(() => report(`${response.status()} loading ${response.url()}`), 1000);
    }
  });
  page.on("pageerror", (error) => report(String(error.stack ?? error)));
  // React catches an error a story throws and logs it rather than letting it
  // reach the page, with this sentence after it. Other console errors, such
  // as a missing key, are warnings and leave the story to be photographed.
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("The above error occurred")) {
      report(message.text().replace(/^%o\s+%s\s+%s\s*/, "").split("\n    at ")[0]);
    }
  });
  return failed;
}

export async function screenshotStories(argv) {
  const { patterns, out, theme } = parseArgs(argv);
  const started = Date.now();
  let base = await runningServer();
  const reused = Boolean(base);
  if (base) {
    console.log(`Using the Ladle server at ${base}.`);
  } else {
    console.log("No Ladle server is running for this checkout, so starting one for this run.");
    try {
      base = await startServer();
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }

  const ids = Object.keys((await (await fetch(`${base}/meta.json`)).json()).stories);
  const matching = ids.filter((id) => patterns.some((pattern) => id === pattern || matchesGlob(id, pattern)));
  if (matching.length === 0) {
    const prefix = patterns[0].split("--")[0].replace(/\*.*$/, "");
    const near = ids.filter((id) => id.startsWith(prefix)).slice(0, 10);
    console.error(`No story matches ${patterns.join(", ")}.${near.length ? ` Stories starting ${prefix}:\n  ${near.join("\n  ")}` : ""}`);
    return 1;
  }

  const outDir = resolve(out);
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  /** Photographs `ids` from `server` into outDir, and returns the ids it served as "Story not found". */
  async function capture(server, ids) {
    let next = 0;
    const missing = [];
    async function worker() {
      const context = await browser.newContext(contextOptions(theme));
      while (next < ids.length && !failure) {
        const id = ids[next++];
        const page = await context.newPage();
        const failed = watchForErrors(page).then((message) => ({ message }));
        const loaded = (async () => {
          await page.goto(`${server}/?story=${id}&mode=preview&theme=${theme}`, { waitUntil: "networkidle", timeout: 30000 });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(200);
          if (await isStoryNotFound(page)) return { missing: true };
          return { image: await photograph(page) };
        })().catch((error) => ({ message: error.message.split("\n")[0] }));
        const result = await Promise.race([failed, loaded]);
        if (result.message) {
          failure ??= `${id} failed to render:\n\n${result.message}`;
          break;
        }
        if (result.missing) {
          missing.push(id);
        } else {
          const file = join(outDir, `${id}.png`);
          writeFileSync(file, result.image);
          console.log(file);
        }
        await page.close();
      }
      await context.close();
    }
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
    return missing;
  }

  let failure = null;
  let missing = await capture(base, matching);
  // A server that was already running can list a story in meta.json and
  // still answer "Story not found" for it. It is left running, since someone
  // else may be using it, and the stories it missed are tried on a fresh one.
  if (!failure && missing.length && reused) {
    console.log(`\nThe Ladle server at ${base} answered "Story not found" for ${missing.join(", ")}, so starting a fresh server for this run.`);
    try {
      missing = await capture(await startServer(), missing);
    } catch (error) {
      failure = `Ladle answered "Story not found" for ${missing.join(", ")}, and a fresh server would not start:\n\n${error.message}`;
    }
  }
  if (!failure && missing.length) {
    failure = `Ladle answered "Story not found" for ${missing.join(", ")}, though meta.json lists ${missing.length === 1 ? "it" : "them"}.`;
  }
  await browser.close();
  if (failure) {
    console.error(`\n${failure}`);
    return 1;
  }
  console.log(`\n${matching.length} ${matching.length === 1 ? "story" : "stories"} in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  return 0;
}

// Renders scripts/<name>.html to the slide image it builds:
//   node scripts/render.mjs who-chart    -> images/intro-who-chart.png
//   node scripts/render.mjs plugins-toc  -> images/intro-plugins-toc.png
// Uses the Playwright install at ~/.claude/tools/playwright.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
const { chromium } = createRequire(join(homedir(), ".claude/tools/playwright/"))("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const out = { "who-chart": "intro-who-chart.png", "plugins-toc": "intro-plugins-toc.png" };
const name = process.argv[2];
if (!out[name]) throw new Error(`Unknown image: ${name}`);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1160, height: 470 }, deviceScaleFactor: 2 });
await p.goto(`file://${join(here, `${name}.html`)}`);
await p.waitForTimeout(500);
await p.screenshot({ path: join(here, "..", "images", out[name]), fullPage: true });
await b.close();

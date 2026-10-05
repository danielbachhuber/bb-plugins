// Verify that every hunk on a thread's branch is shown exactly once in the
// real Reviewmaxx panel.
//
//   npm run verify -- <thread id>
//
// 1. Runs `bb reviewmaxx verify`, which checks git against the stored
//    grouping, and takes the list of items from it.
// 2. Opens the thread in bb with Playwright, opens the Reviewmaxx panel,
//    chooses each concern in its rail in turn, waits for every diff to draw,
//    and compares the rendered items with that list.
// Exits 1 on any gap. Needs a running bb, and the global Playwright install.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const threadId = process.argv[2];
if (!threadId) {
  console.error("usage: npm run verify -- <thread id>");
  process.exit(2);
}

// 1. Data.
let data;
try {
  data = JSON.parse(execFileSync("bb", ["reviewmaxx", "verify", "--thread", threadId, "--json"], { encoding: "utf8" }));
} catch (error) {
  // verify exits 1 on a gap but still prints its JSON.
  data = JSON.parse(error.stdout);
}
console.log(`data: ${data.text}`);
if (!data.ok) process.exit(1);

// 2. Rendering.
const { chromium } = await import(path.join(os.homedir(), ".claude/tools/playwright/node_modules/playwright/index.mjs"));
const { serverUrl } = JSON.parse(readFileSync(path.join(os.homedir(), ".bb/bb-app-runtime.json"), "utf8"));
const outDir = "/tmp/reviewmaxx-verify";
mkdirSync(outDir, { recursive: true });

const problems = [];
const browser = await chromium.launch();
const runs = [
  { name: "desktop", width: 1440, scheme: "light" },
  { name: "dark", width: 1440, scheme: "dark" },
  { name: "narrow", width: 900, scheme: "light" },
];

for (const run of runs) {
  const page = await browser.newPage({ viewport: { width: run.width, height: 1000 }, colorScheme: run.scheme });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`script: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

  await page.goto(`${serverUrl}/threads/${threadId}`);
  // bb remembers whether the right panel was open, so open it only when it is closed.
  await page.getByRole("toolbar", { name: "Right panel views" }).or(page.getByRole("button", { name: /^Show right panel/ })).first().waitFor();
  const panelOpen = await page.getByRole("button", { name: /^Hide right panel/ }).first().isVisible().catch(() => false);
  if (!panelOpen) await page.getByRole("button", { name: /^Show right panel/ }).first().click();
  const action = page.locator('[id="plugin-action:reviewmaxx:review"]');
  if (!(await action.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^Open new tab/ }).first().click();
  }
  await action.click();
  await page.waitForSelector('[data-reviewmaxx="ready"]', { timeout: 60_000 });

  // The panel shows one concern at a time: choose each entry in the rail,
  // switch a test concern to Diff, open folded files, and collect its hunks.
  const rendered = [];
  const entries = await page.locator("[data-reviewmaxx] [data-rail-item]").count();
  for (let i = 0; i < entries; i++) {
    await page.locator("[data-reviewmaxx] [data-rail-item]").nth(i).click();
    // A test concern: show every scenario, folded and with values, in this one
    // session, since bb's source viewer keeps what it drew before and a mismatch
    // logs a console error that fails the run.
    const scenarios = page.locator("[data-reviewmaxx] [data-scenario]");
    const box = page.getByRole("checkbox", { name: "Show values" });
    for (let pass = 0; pass < 2 && (await scenarios.count()) > 0; pass++) {
      for (let n = 0; n < (await scenarios.count()); n++) await scenarios.nth(n).click();
      await box.click();
    }
    await page.evaluate(() => {
      document.querySelector('[data-reviewmaxx] [data-mode="diff"]')?.click();
      document.querySelectorAll("[data-reviewmaxx] details").forEach((d) => { d.open = true; });
    });
    // A drawn diff has height; an empty placeholder does not. One read per
    // check, not per row in a loop that writes.
    await page
      .waitForFunction(
        () => [...document.querySelectorAll('[data-reviewmaxx] [data-kind="hunk"]:not([data-status="removed"])')].every((el) => el.getBoundingClientRect().height > 16),
        null,
        { timeout: 60_000 },
      )
      .catch(() => errors.push(`not every diff drew within 60 s in rail entry ${i + 1}`));
    rendered.push(
      ...(await page.evaluate(() =>
        [...document.querySelectorAll("[data-reviewmaxx] [data-file][data-hunk]")]
          .filter((el) => el.getAttribute("data-status") !== "removed")
          .map((el) => `${el.getAttribute("data-file")}#${el.getAttribute("data-hunk")}`),
      )),
    );
  }
  const overflow = await page.evaluate(() => {
    const root = document.querySelector("[data-reviewmaxx]");
    return root && root.scrollWidth > root.clientWidth + 1 ? `panel content is ${root.scrollWidth}px wide in ${root.clientWidth}px` : null;
  });
  if (overflow) errors.push(overflow);

  const counts = new Map();
  for (const key of rendered) counts.set(key, (counts.get(key) ?? 0) + 1);
  const missing = data.items.filter((key) => !counts.has(key));
  const twice = data.items.filter((key) => counts.get(key) > 1);
  const extra = [...counts.keys()].filter((key) => !data.items.includes(key));

  const shot = path.join(outDir, `${threadId}.${run.name}.png`);
  // bb can remount a panel tab after it first draws; picture the drawn one.
  await page.locator('[data-reviewmaxx="ready"]').screenshot({ path: shot });
  console.log(
    `${run.name}: ${data.items.length} hunks: ${data.items.length - missing.length - twice.length} rendered once, ${missing.length} missing, ${twice.length} twice -> ${shot}`,
  );
  for (const key of missing) errors.push(`missing: ${key}`);
  for (const key of twice) errors.push(`twice: ${key}`);
  for (const key of extra) errors.push(`not in the diff: ${key}`);
  for (const e of [...new Set(errors)]) console.log(`  ${e}`);
  problems.push(...errors);
  await page.close();
}

await browser.close();
process.exit(problems.length ? 1 : 0);

// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BB_PICKER_SELECTORS, FIXED_ENVIRONMENT_ATTRIBUTE, FIXED_ENVIRONMENT_CSS } from "./start-thread-dialog.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const composer = `
  <div data-promptbox-shell="">
    <button aria-label="Model">Opus</button>
    <button aria-label="Project: widgets">widgets</button>
    <button aria-label="Environment">Worktree</button>
    <button aria-label="Branch">from main</button>
    <button aria-label="Permission mode">Auto</button>
  </div>`;

describe("FIXED_ENVIRONMENT_CSS", () => {
  it("hides the environment pickers only in a marked composer", () => {
    document.body.innerHTML = `<div ${FIXED_ENVIRONMENT_ATTRIBUTE}="">${composer}</div>${composer}`;
    const selector = FIXED_ENVIRONMENT_CSS.slice(0, FIXED_ENVIRONMENT_CSS.indexOf("{")).trim();
    const hidden = Array.from(document.querySelectorAll(selector));
    expect(hidden.map((element) => element.getAttribute("aria-label"))).toEqual([
      "Project: widgets",
      "Environment",
      "Branch",
    ]);
    const marked = document.querySelector(`[${FIXED_ENVIRONMENT_ATTRIBUTE}]`)!;
    expect(hidden.every((element) => marked.contains(element))).toBe(true);
  });
});

/**
 * The labels are the only handles bb's pickers offer. If bb renames one, the
 * CSS stops matching and that picker reappears in a dialog where it does
 * nothing; this fails first, wherever a bb checkout is available.
 */
const pickers = join(process.env.BB_SOURCE_DIR ?? join(homedir(), "projects/bb"), "apps/app/src/components/pickers");

describe.skipIf(!existsSync(pickers))("bb's picker source", () => {
  it("still labels each picker the way the selector expects", () => {
    const source = (file: string) => readFileSync(join(pickers, file), "utf8");
    expect(source("ProjectSelector.tsx")).toContain("aria-label={`Project: ${");
    expect(source("EnvironmentPicker.tsx")).toContain('aria-label="Environment"');
    expect(source("MachinePicker.tsx")).toContain('aria-label="Machine"');
    expect(source("BranchPicker.tsx")).toContain('aria-label="Branch"');
    expect(BB_PICKER_SELECTORS).toHaveLength(4);
  });
});

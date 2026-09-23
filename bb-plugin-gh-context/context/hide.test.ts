// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BB_BANNER_LABELS, HIDE_SELECTOR, mount } from "./hide.js";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function shell(withMarker: boolean): string {
  return `
    <div data-promptbox-shell="">
      <div class="grid">
        <div class="contents" data-gh-context-banner="" ${withMarker ? "data-gh-context-hide" : ""}></div>
        <section aria-label="Thread context before sending">bb</section>
        <section aria-label="Child threads">children</section>
        <section aria-label="Queued messages">queue</section>
      </div>
    </div>`;
}

describe("mount", () => {
  it("adds one style element, and removes it on dispose or abort", () => {
    const controller = new AbortController();
    const dispose = mount(controller.signal);
    expect(document.head.querySelectorAll("style")).toHaveLength(1);
    dispose();
    expect(document.head.querySelectorAll("style")).toHaveLength(0);

    mount(controller.signal);
    controller.abort();
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });
});

describe("HIDE_SELECTOR", () => {
  it("matches bb's two cards only in a prompt box carrying the marker", () => {
    document.body.innerHTML = shell(true) + shell(false);
    const [marked, unmarked] = Array.from(document.querySelectorAll("[data-promptbox-shell]"));
    const hidden = Array.from(document.querySelectorAll(HIDE_SELECTOR));
    expect(hidden.map((element) => element.getAttribute("aria-label"))).toEqual([
      "Thread context before sending",
      "Child threads",
    ]);
    expect(hidden.every((element) => marked!.contains(element))).toBe(true);
    expect(hidden.some((element) => unmarked!.contains(element))).toBe(false);
  });
});

/**
 * The labels are the only handles bb's banner offers. If bb renames one, the
 * CSS silently stops matching and bb's banner comes back under gh-context's;
 * this fails first, wherever a bb checkout is available.
 */
const bbSourceDir = process.env.BB_SOURCE_DIR ?? join(homedir(), "projects/bb");
const bannerSource = join(
  bbSourceDir,
  "apps/app/src/components/promptbox/banner/ThreadPromptContextBanner.tsx",
);

describe.skipIf(!existsSync(bannerSource))("bb's banner source", () => {
  it("still labels both cards the way the selector expects", () => {
    const source = readFileSync(bannerSource, "utf8");
    for (const label of BB_BANNER_LABELS) {
      expect(source).toContain(`ariaLabel="${label}"`);
    }
  });
});

// @vitest-environment jsdom
//
// The loop driven against a DOM shaped like bb's, with a fake bb standing in
// for React: clicking a collapse control flips `aria-expanded` and the label,
// the way bb's own button does. The last suite stands in for diff-viewed as
// well, because "a file I marked read stays folded" is a promise about two
// plugins running side by side, not about either one alone.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startEngine, type Engine } from "./engine";
import { VIEWED_ATTR } from "./cards";
import { AUTO_COLLAPSE_FILE_THRESHOLD } from "./rules";

/** A card header plus the bit of bb behavior that responds to a click. */
function renderCard(
  path: string,
  options: { stats?: string; collapsed?: boolean; viewed?: boolean } = {},
): HTMLButtonElement {
  const { stats = "+2 -2", collapsed = true, viewed = false } = options;
  const host = document.createElement("div");
  host.innerHTML = `
    <div class="flex w-full min-w-0 items-center justify-between gap-2"${
      viewed ? ` ${VIEWED_ATTR}="true"` : ""
    }>
      <span class="flex min-w-0 items-center">
        <button type="button" aria-label="${collapsed ? "Expand" : "Collapse"} ${path}" aria-expanded="${!collapsed}"></button>
        <span><span class="font-mono">${path}</span></span>
      </span>
      <span class="flex shrink-0 items-center gap-1"><span>${stats}</span></span>
    </div>`;
  document.body.append(host);
  const toggle = host.querySelector("button") as HTMLButtonElement;
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.setAttribute(
      "aria-label",
      `${expanded ? "Expand" : "Collapse"} ${path}`,
    );
  });
  return toggle;
}

function renderDiff(
  fileCount: number,
  options: { stats?: string; collapsed?: boolean } = {},
): HTMLButtonElement[] {
  return Array.from({ length: fileCount }, (_, index) =>
    renderCard(`src/file-${index}.ts`, options),
  );
}

const isExpanded = (toggle: HTMLButtonElement) =>
  toggle.getAttribute("aria-expanded") === "true";

const OVER_THRESHOLD = AUTO_COLLAPSE_FILE_THRESHOLD + 1;

let controller: AbortController;
let started: Engine[] = [];
let pending: (() => void)[] = [];

function flush(): void {
  for (let guard = 0; guard < 20 && pending.length > 0; guard += 1) {
    const queued = pending;
    pending = [];
    for (const run of queued) run();
  }
}

function start(): Engine {
  const engine = startEngine({
    signal: controller.signal,
    doc: document,
    defer: (run) => {
      pending.push(run);
      return () => {
        pending = pending.filter((queued) => queued !== run);
      };
    },
  });
  started.push(engine);
  flush();
  return engine;
}

beforeEach(() => {
  controller = new AbortController();
  started = [];
  pending = [];
});

afterEach(() => {
  for (const engine of started) engine.dispose();
  controller.abort();
  document.body.innerHTML = "";
});

describe("a diff bb auto-collapsed", () => {
  it("opens every collapsed file", () => {
    const toggles = renderDiff(OVER_THRESHOLD);
    start();

    expect(toggles.every(isExpanded)).toBe(true);
  });

  it("opens a diff that arrives after the engine starts", () => {
    const engine = start();
    const toggles = renderDiff(OVER_THRESHOLD);
    engine.syncNow();

    expect(toggles.every(isExpanded)).toBe(true);
  });

  it("leaves deleted files folded", () => {
    const deleted = renderCard("src/gone.ts", { stats: "-40" });
    const rest = renderDiff(OVER_THRESHOLD);
    start();

    expect(isExpanded(deleted)).toBe(false);
    expect(rest.every(isExpanded)).toBe(true);
  });
});

describe("a diff bb did not auto-collapse", () => {
  it("leaves a file the user collapsed alone", () => {
    const toggles = renderDiff(AUTO_COLLAPSE_FILE_THRESHOLD, {
      collapsed: false,
    });
    toggles[0]!.click();
    const engine = start();
    engine.syncNow();

    expect(isExpanded(toggles[0]!)).toBe(false);
  });
});

describe("what the user does afterwards", () => {
  it("does not reopen a file collapsed by hand", () => {
    const toggles = renderDiff(OVER_THRESHOLD);
    const engine = start();
    expect(isExpanded(toggles[0]!)).toBe(true);

    toggles[0]!.click();
    engine.syncNow();
    flush();

    expect(isExpanded(toggles[0]!)).toBe(false);
  });

  it("stops touching the panel once disposed", () => {
    const engine = start();
    engine.dispose();
    const toggles = renderDiff(OVER_THRESHOLD);
    flush();

    expect(toggles.some(isExpanded)).toBe(false);
  });
});

describe("running alongside diff-viewed", () => {
  it("leaves a file diff-viewed has already marked read folded", () => {
    const viewed = renderCard("src/read.ts", { viewed: true });
    const rest = renderDiff(OVER_THRESHOLD);
    start();

    expect(isExpanded(viewed)).toBe(false);
    expect(rest.every(isExpanded)).toBe(true);
  });

  it("lets diff-viewed refold a file opened before its marks had loaded", () => {
    // diff-viewed decorates before its marks arrive, so the attribute can show
    // up a pass late. Opening the file is what tells diff-viewed to collapse
    // it, and the mark then keeps this hack off the card for good.
    const late = renderCard("src/read.ts");
    renderDiff(OVER_THRESHOLD);
    const engine = start();
    expect(isExpanded(late)).toBe(true);

    // diff-viewed's marks land: it paints the row and refolds the file.
    late.closest(".justify-between")?.setAttribute(VIEWED_ATTR, "true");
    late.click();
    engine.syncNow();
    flush();

    expect(isExpanded(late)).toBe(false);
  });
});

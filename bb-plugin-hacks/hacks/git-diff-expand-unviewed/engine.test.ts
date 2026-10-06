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

/** More than bb's threshold of ten, so bb starts every file folded. */
const OVER_THRESHOLD = 11;

/** bb's range dropdown, whose label is part of the diff's identity. */
function renderRange(label: string): HTMLElement {
  const slot = document.createElement("div");
  slot.setAttribute("data-testid", "git-diff-toolbar-selector-slot");
  slot.innerHTML = `<button type="button">${label}</button>`;
  document.body.append(slot);
  return slot.querySelector("button")!;
}

/** bb's Collapse all files button, which folds every card when clicked. */
function renderCollapseAll(): HTMLButtonElement {
  const button = document.createElement("button");
  button.setAttribute("aria-label", "Collapse all files");
  document.body.append(button);
  button.addEventListener("click", () => {
    for (const toggle of document.querySelectorAll<HTMLButtonElement>(
      'button[aria-expanded="true"]',
    )) {
      toggle.click();
    }
  });
  return button;
}

/** bb throwing its card state away: every card folds again. */
function foldAll(toggles: HTMLButtonElement[]): void {
  for (const toggle of toggles) {
    if (isExpanded(toggle)) toggle.click();
  }
}

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
    const toggles = renderDiff(3, { collapsed: false });
    const engine = start();
    toggles[0]!.click();
    engine.syncNow();
    flush();

    expect(isExpanded(toggles[0]!)).toBe(false);
  });
});

describe("a virtualized list", () => {
  it("opens a folded card even when few cards are rendered", () => {
    // bb renders only the cards near the viewport, so a forty-file diff can
    // have a handful in the DOM once the first few are open.
    const toggles = renderDiff(3);
    start();

    expect(toggles.every(isExpanded)).toBe(true);
  });
});

describe("bb resetting its card state", () => {
  it("opens the files again after the range changes", () => {
    const range = renderRange("All changes");
    const toggles = renderDiff(OVER_THRESHOLD);
    const engine = start();
    expect(toggles.every(isExpanded)).toBe(true);

    range.textContent = "Uncommitted changes";
    foldAll(toggles);
    engine.syncNow();
    flush();

    expect(toggles.every(isExpanded)).toBe(true);
  });

  it("opens the files again after switching threads and back", () => {
    window.history.pushState({}, "", "/threads/thr_one");
    const toggles = renderDiff(OVER_THRESHOLD);
    const engine = start();

    window.history.pushState({}, "", "/threads/thr_two");
    engine.syncNow();
    window.history.pushState({}, "", "/threads/thr_one");
    foldAll(toggles);
    engine.syncNow();
    flush();

    expect(toggles.every(isExpanded)).toBe(true);
    window.history.pushState({}, "", "/");
  });
});

describe("Collapse all files", () => {
  it("keeps every file folded until the diff changes", () => {
    const range = renderRange("All changes");
    const collapseAll = renderCollapseAll();
    const toggles = renderDiff(OVER_THRESHOLD);
    const engine = start();

    collapseAll.click();
    const scrolledIn = renderCard("src/later.ts");
    engine.syncNow();
    flush();
    expect(toggles.some(isExpanded)).toBe(false);
    expect(isExpanded(scrolledIn)).toBe(false);

    range.textContent = "Uncommitted changes";
    engine.syncNow();
    flush();
    expect(isExpanded(scrolledIn)).toBe(true);
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

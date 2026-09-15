// @vitest-environment jsdom
//
// The loop, exercised against a real document. diff-viewed learned this the
// hard way: every bug it shipped was in the wiring, and green tests of pure
// functions never touched it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startEngine, type Engine } from "./engine";
import { OWNED_ATTR } from "./header";
import { renderCard, renderToolbar } from "./fixture";

let engine: Engine | null = null;
let controller: AbortController;
const warn = vi.fn();

function start(): Engine {
  controller = new AbortController();
  engine = startEngine({
    signal: controller.signal,
    doc: document,
    // Run deferred passes immediately; the scheduler is bb's concern.
    defer: (run) => {
      run();
      return () => {};
    },
    warn,
  });
  return engine;
}

function pencils(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(`button[${OWNED_ATTR}]`),
  );
}

beforeEach(() => {
  warn.mockClear();
});

afterEach(() => {
  engine?.dispose();
  engine = null;
  document.body.innerHTML = "";
});

describe("startEngine", () => {
  it("puts a pencil on a markdown file in the changes panel", () => {
    renderToolbar();
    renderCard({ path: "docs/notes.md" });
    start().syncNow();

    expect(pencils()).toHaveLength(1);
    expect(pencils()[0]?.getAttribute("aria-label")).toBe(
      "Edit docs/notes.md in the markdown editor",
    );
  });

  it("leaves a file this plugin cannot open alone", () => {
    renderToolbar();
    renderCard({ path: "app.tsx" });
    start().syncNow();

    expect(pencils()).toHaveLength(0);
  });

  it("puts the pencil after bb's own icons, not in the stats group", () => {
    renderToolbar();
    renderCard({ path: "notes.md" });
    start().syncNow();

    const pencil = pencils()[0]!;
    const siblings = Array.from(pencil.parentElement!.children);
    expect(siblings.at(-1)).toBe(pencil);
    expect(siblings.at(-2)?.getAttribute("aria-label")).toBe(
      "Open notes.md in editor",
    );
  });

  it("opens the file by clicking bb's own path control", () => {
    renderToolbar();
    renderCard({ path: "notes.md" });
    const pathButton = document.querySelector<HTMLButtonElement>(
      'button[title="notes.md"]',
    )!;
    const onOpen = vi.fn();
    pathButton.addEventListener("click", onOpen);
    start().syncNow();

    pencils()[0]!.click();

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("skips a markdown file bb rendered with no path control to click", () => {
    renderToolbar();
    renderCard({ path: "notes.md", openable: false, icons: false });
    start().syncNow();

    expect(pencils()).toHaveLength(0);
  });

  it("does not inject a second pencil on a later pass", () => {
    renderToolbar();
    renderCard({ path: "notes.md" });
    const started = start();
    started.syncNow();
    started.syncNow();

    expect(pencils()).toHaveLength(1);
  });

  it("re-injects after bb re-renders the header", () => {
    renderToolbar();
    const host = renderCard({ path: "notes.md" });
    const started = start();
    started.syncNow();
    host.remove();
    renderCard({ path: "notes.md" });
    started.syncNow();

    expect(pencils()).toHaveLength(1);
  });

  it("stays out of surfaces with no changes panel", () => {
    renderCard({ path: "notes.md" });
    start().syncNow();

    expect(pencils()).toHaveLength(0);
  });

  it("cleans up when the changes panel closes", () => {
    renderToolbar();
    renderCard({ path: "notes.md" });
    const started = start();
    started.syncNow();
    expect(pencils()).toHaveLength(1);

    document.querySelector('[data-testid="git-diff-toolbar-actions"]')!.remove();
    started.syncNow();

    expect(pencils()).toHaveLength(0);
  });

  it("removes every pencil on dispose", () => {
    renderToolbar();
    renderCard({ path: "notes.md" });
    const started = start();
    started.syncNow();
    started.dispose();
    engine = null;

    expect(pencils()).toHaveLength(0);
  });

  it("does nothing once its generation is aborted", () => {
    renderToolbar();
    const started = start();
    controller.abort();
    renderCard({ path: "notes.md" });
    started.syncNow();

    expect(pencils()).toHaveLength(0);
  });

  it("reacts to a card bb renders after the first pass", async () => {
    renderToolbar();
    start();
    renderCard({ path: "notes.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pencils()).toHaveLength(1);
  });
});

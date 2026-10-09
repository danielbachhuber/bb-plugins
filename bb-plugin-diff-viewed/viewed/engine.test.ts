// @vitest-environment jsdom
//
// The sync loop driven against a DOM shaped like bb's, with a fake bb standing
// in for React: clicking a collapse control flips `aria-expanded` and the
// label, the way bb's own button does. That is enough to catch the failures
// that only show up once the pieces are wired together.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startEngine, type Engine } from "./engine";
import { FILTER_ATTR, OWNED_ATTR, VIEWED_ATTR } from "./dom";
import type { GithubState } from "./github";
import type { DiffFileEntry } from "./marks";

const THREAD = "/projects/proj_x/threads/thr_a";

/**
 * bb's changes panel holds every file in a `files` prop, and each rendered row
 * reaches it through React's fiber. These stand in for both: `panel.files`
 * is the whole diff, whether or not a card for a file is rendered.
 */
const panel: { files: DiffFileEntry[]; targetType: string } = {
  files: [],
  targetType: "all",
};

function fileEntry(path: string, stats = "+2 -2"): DiffFileEntry {
  const [, additions = "0", deletions = "0"] = /\+(\d+) -(\d+)/.exec(stats) ?? [];
  return {
    path,
    previousPath: null,
    changeKind: "modified",
    additions: Number(additions),
    deletions: Number(deletions),
    binary: false,
  };
}

function attachFiber(row: HTMLElement): void {
  Object.assign(row, {
    __reactFiber$test: {
      memoizedProps: { className: "absolute left-0 w-full" },
      return: {
        memoizedProps: { className: "relative w-full" },
        return: {
          memoizedProps: {
            get files() {
              return panel.files;
            },
            get target() {
              return { type: panel.targetType };
            },
          },
          return: null,
        },
      },
    },
  });
}

/** A card header plus the bit of bb behavior that responds to a click. */
function renderCard(path: string, stats = "+2 -2"): HTMLButtonElement {
  if (!panel.files.some((file) => file.path === path)) {
    panel.files.push(fileEntry(path, stats));
  }
  const host = document.createElement("div");
  host.setAttribute("data-index", String(panel.files.length - 1));
  attachFiber(host);
  host.innerHTML = `
    <div class="flex w-full min-w-0 items-center justify-between gap-2">
      <span class="flex min-w-0 items-center">
        <button type="button" aria-label="Collapse ${path}" aria-expanded="true"></button>
        <span><span class="font-mono">${path}</span></span>
      </span>
      <span class="flex shrink-0 items-center gap-1"><span>${stats}</span></span>
    </div>`;
  document.body.append(host);
  const toggle = host.querySelector("button") as HTMLButtonElement;
  // Stand in for bb's React handler: collapse state lives in aria-expanded,
  // and the accessible name flips with it.
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.setAttribute("aria-label", `${expanded ? "Expand" : "Collapse"} ${path}`);
  });
  return toggle;
}

function renderToolbar(): HTMLElement {
  const details = document.createElement("div");
  details.setAttribute("data-testid", "git-diff-toolbar-details");
  details.innerHTML = `<span data-testid="git-diff-toolbar-summary">2 files, +4 -4</span>`;
  const toolbar = document.createElement("div");
  toolbar.setAttribute("data-testid", "git-diff-toolbar-actions");
  toolbar.innerHTML = `
    <button type="button" aria-label="Collapse all files"></button>
    <button type="button" aria-label="Wrap diff lines" aria-pressed="false"></button>
    <button type="button" aria-label="Stacked diff view" aria-pressed="true"></button>
    <button type="button" aria-label="Split diff view" aria-pressed="false"></button>`;
  details.append(toolbar);
  document.body.prepend(details);
  return toolbar;
}

/**
 * bb's range dropdown: the trigger in the toolbar's selector slot, and, when
 * `open`, the Radix menu it points at through `aria-controls`.
 */
function renderSelector(open: boolean): HTMLElement {
  const slot = document.createElement("div");
  slot.setAttribute("data-testid", "git-diff-toolbar-selector-slot");
  slot.innerHTML = `<button type="button" aria-haspopup="menu"
    aria-expanded="${open}" aria-controls="radix-menu-1">All changes</button>`;
  document.body.prepend(slot);
  const menu = document.createElement("div");
  menu.id = "radix-menu-1";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <div role="menuitem">All changes</div>
    <div role="menuitem">Uncommitted changes</div>`;
  if (open) document.body.append(menu);
  return menu;
}

function filterItem(): HTMLElement | null {
  return document.querySelector('[role="menuitemcheckbox"]');
}

function checkboxFor(toggle: HTMLButtonElement): HTMLInputElement | null {
  const headerRow = toggle.parentElement?.parentElement;
  const input = headerRow?.querySelector(`label[${OWNED_ATTR}] input`);
  return input instanceof HTMLInputElement ? input : null;
}

function isCollapsed(toggle: HTMLButtonElement): boolean {
  return toggle.getAttribute("aria-expanded") === "false";
}

interface Harness {
  engine: Engine;
  calls: { method: string; input: unknown }[];
  record: Record<string, string>;
  /** Let queued promise callbacks run, then re-sync. */
  settle: () => Promise<void>;
}

let controller: AbortController;
let started: Engine[] = [];

function start(
  options: {
    record?: Record<string, string>;
    pathname?: string;
    onlyUnviewed?: boolean;
    /** The pull request files the server reports, as when sync is on. */
    github?: GithubState;
    /** Collect warnings instead of failing the test on the first one. */
    warnings?: unknown[];
    /** Hold viewed_list until this settles, as a slow GitHub query does. */
    listGate?: Promise<void>;
  } = {},
): Harness {
  const calls: { method: string; input: unknown }[] = [];
  const record: Record<string, string> = { ...(options.record ?? {}) };
  let onlyUnviewed = options.onlyUnviewed ?? false;
  let github: GithubState | null = options.github ?? null;

  const rpc = async <Result,>(method: string, input: unknown): Promise<Result> => {
    calls.push({ method, input });
    if (method === "filter_get") return { onlyUnviewed } as Result;
    if (method === "filter_set") {
      ({ onlyUnviewed } = input as { onlyUnviewed: boolean });
      return { onlyUnviewed } as Result;
    }
    if (method === "viewed_set") {
      const { path, fingerprint, viewed } = input as {
        path: string;
        fingerprint: string;
        viewed: boolean;
      };
      if (viewed) record[path] = fingerprint;
      else delete record[path];
      if (github !== null) {
        github = {
          ...github,
          files: github.files.map((file) =>
            file.path === path && `+${file.additions} -${file.deletions}` === fingerprint
              ? { ...file, viewed }
              : file,
          ),
        };
      }
    }
    if (method === "viewed_prune" || method === "viewed_marks") {
      return { record: { ...record } } as Result;
    }
    if (method === "viewed_list" && options.listGate !== undefined) await options.listGate;
    return { record: { ...record }, github } as Result;
  };

  const engine = startEngine({
    rpc,
    signal: controller.signal,
    doc: document,
    pathname: () => options.pathname ?? THREAD,
    // Run deferred passes immediately: the tests drive time explicitly.
    defer: (run) => {
      run();
      return () => {};
    },
    warn: (cause) => {
      if (options.warnings === undefined) throw cause;
      options.warnings.push(cause);
    },
  });
  started.push(engine);

  return {
    engine,
    calls,
    record,
    async settle() {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      engine.syncNow();
    },
  };
}

beforeEach(() => {
  panel.files = [];
  panel.targetType = "all";
  controller = new AbortController();
  started = [];
});

afterEach(() => {
  for (const engine of started) engine.dispose();
  controller.abort();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute(FILTER_ATTR);
  vi.restoreAllMocks();
});

describe("marking a file viewed", () => {
  it("collapses the file", async () => {
    renderToolbar();
    const toggle = renderCard("client/system/demo.jest.tsx");
    const harness = start();
    await harness.settle();

    const checkbox = checkboxFor(toggle);
    expect(checkbox).not.toBeNull();
    expect(isCollapsed(toggle)).toBe(false);

    checkbox!.click();
    expect(isCollapsed(toggle)).toBe(true);
  });

  it("dims the header", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts");
    const harness = start();
    await harness.settle();

    checkboxFor(toggle)!.click();
    const headerRow = toggle.parentElement!.parentElement!;
    expect(headerRow.getAttribute(VIEWED_ATTR)).toBe("true");
  });

  it("persists the mark for the thread in the route", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts", "+8 -4");
    const harness = start();
    await harness.settle();

    checkboxFor(toggle)!.click();
    await harness.settle();

    expect(harness.calls).toContainEqual({
      method: "viewed_set",
      input: {
        threadId: "thr_a",
        path: "a.ts",
        fingerprint: "+8 -4",
        viewed: true,
      },
    });
    expect(harness.record).toEqual({ "a.ts": "+8 -4" });
  });

  it("collapses even after bb has re-rendered the header", async () => {
    // Regression: the click handler used to close over the card object from
    // the pass that injected it, so `isCollapsed` was a snapshot and `toggle`
    // could be a detached node.
    renderToolbar();
    const toggle = renderCard("a.ts");
    const harness = start();
    await harness.settle();

    // bb re-renders: the header's contents are rebuilt around the same button.
    const pathSpan = toggle.nextElementSibling as HTMLElement;
    pathSpan.innerHTML = `<span class="font-mono">a.ts</span>`;
    harness.engine.syncNow();

    checkboxFor(toggle)!.click();
    expect(isCollapsed(toggle)).toBe(true);
  });

  it("collapses after bb replaces the collapse button itself", async () => {
    // The harsher re-render: React swaps the button node rather than reusing
    // it. Anything holding the old element — a closure, or a lookup keyed on
    // it — is now pointing at a node that is not in the document.
    renderToolbar();
    const toggle = renderCard("a.ts");
    const harness = start();
    await harness.settle();

    const left = toggle.parentElement!;
    const replacement = toggle.cloneNode(true) as HTMLButtonElement;
    replacement.addEventListener("click", () => {
      const expanded = replacement.getAttribute("aria-expanded") === "true";
      replacement.setAttribute("aria-expanded", String(!expanded));
      replacement.setAttribute(
        "aria-label",
        `${expanded ? "Expand" : "Collapse"} a.ts`,
      );
    });
    left.replaceChild(replacement, toggle);
    harness.engine.syncNow();

    checkboxFor(replacement)!.click();
    expect(isCollapsed(replacement)).toBe(true);
  });

  it("does not re-expand the file on the next pass", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts");
    const harness = start();
    await harness.settle();

    checkboxFor(toggle)!.click();
    await harness.settle();
    harness.engine.syncNow();

    expect(isCollapsed(toggle)).toBe(true);
    expect(checkboxFor(toggle)!.checked).toBe(true);
  });
});

describe("unmarking a file", () => {
  it("expands it again", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts");
    const harness = start();
    await harness.settle();

    checkboxFor(toggle)!.click();
    await harness.settle();
    expect(isCollapsed(toggle)).toBe(true);

    checkboxFor(toggle)!.click();
    expect(isCollapsed(toggle)).toBe(false);
  });

  it("clears the stored mark", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts", "+8 -4");
    const harness = start({ record: { "a.ts": "+8 -4" } });
    await harness.settle();

    checkboxFor(toggle)!.click();
    await harness.settle();
    expect(harness.record).toEqual({});
  });
});

describe("restoring marks", () => {
  it("collapses a file that was already viewed", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts", "+8 -4");
    const harness = start({ record: { "a.ts": "+8 -4" } });
    await harness.settle();

    expect(isCollapsed(toggle)).toBe(true);
    expect(checkboxFor(toggle)!.checked).toBe(true);
  });

  it("leaves a file alone when its diff has changed since", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts", "+9 -4");
    const harness = start({ record: { "a.ts": "+8 -4" } });
    await harness.settle();

    expect(isCollapsed(toggle)).toBe(false);
    expect(checkboxFor(toggle)!.checked).toBe(false);
  });

  it("lets a viewed file be reopened without snapping shut again", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts", "+8 -4");
    const harness = start({ record: { "a.ts": "+8 -4" } });
    await harness.settle();
    expect(isCollapsed(toggle)).toBe(true);

    toggle.click(); // the user expands it to re-read
    harness.engine.syncNow();
    expect(isCollapsed(toggle)).toBe(false);
  });
});

describe("Expand all files", () => {
  /** bb's toolbar button, set to expand, and what its click does to the cards. */
  function renderExpandAll(toggles: HTMLButtonElement[]): HTMLButtonElement {
    const toolbar = renderToolbar();
    const button = toolbar.querySelector("button") as HTMLButtonElement;
    button.setAttribute("aria-label", "Expand all files");
    button.addEventListener("click", () => {
      button.setAttribute("aria-label", "Collapse all files");
      for (const toggle of toggles) if (isCollapsed(toggle)) toggle.click();
    });
    return button;
  }

  it("keeps viewed files collapsed", async () => {
    const viewed = renderCard("a.ts", "+8 -4");
    const unviewed = renderCard("b.ts", "+1 -1");
    unviewed.click();
    const button = renderExpandAll([viewed, unviewed]);
    const harness = start({ record: { "a.ts": "+8 -4" } });
    await harness.settle();
    expect(isCollapsed(viewed)).toBe(true);

    button.click();
    await harness.settle();

    expect(isCollapsed(viewed)).toBe(true);
    expect(isCollapsed(unviewed)).toBe(false);
  });

  it("still lets a viewed file be reopened afterwards", async () => {
    const viewed = renderCard("a.ts", "+8 -4");
    const button = renderExpandAll([viewed]);
    const harness = start({ record: { "a.ts": "+8 -4" } });
    await harness.settle();
    button.click();
    await harness.settle();
    expect(isCollapsed(viewed)).toBe(true);

    viewed.click();
    harness.engine.syncNow();
    expect(isCollapsed(viewed)).toBe(false);
  });
});

describe("scope", () => {
  it("decorates nothing when the changes panel is not open", async () => {
    renderCard("a.ts");
    const harness = start();
    await harness.settle();

    expect(document.querySelectorAll(`[${OWNED_ATTR}]`)).toHaveLength(0);
  });

  it("decorates nothing off a thread route", async () => {
    renderToolbar();
    renderCard("a.ts");
    const harness = start({ pathname: "/projects/proj_x" });
    await harness.settle();

    expect(document.querySelectorAll(`[${OWNED_ATTR}]`)).toHaveLength(0);
  });

  it("removes its own decoration on dispose", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts");
    const harness = start();
    await harness.settle();
    expect(checkboxFor(toggle)).not.toBeNull();

    harness.engine.dispose();
    expect(document.querySelectorAll(`[${OWNED_ATTR}]`)).toHaveLength(0);
    expect(document.querySelectorAll(`[${VIEWED_ATTR}]`)).toHaveLength(0);
  });
});

describe("Only unviewed", () => {
  it("adds an unchecked item to the open range dropdown", async () => {
    renderToolbar();
    const menu = renderSelector(true);
    const harness = start();
    await harness.settle();

    const item = filterItem();
    expect(item?.parentElement).toBe(menu);
    expect(item?.textContent).toBe("Only unviewed");
    expect(item?.getAttribute("aria-checked")).toBe("false");
    expect(document.documentElement.hasAttribute(FILTER_ATTR)).toBe(false);
  });

  it("adds the item only once across passes", async () => {
    renderToolbar();
    renderSelector(true);
    const harness = start();
    await harness.settle();
    harness.engine.syncNow();

    expect(document.querySelectorAll('[role="menuitemcheckbox"]')).toHaveLength(1);
  });

  it("leaves a closed dropdown alone", async () => {
    renderToolbar();
    renderSelector(false);
    const harness = start();
    await harness.settle();

    expect(filterItem()).toBeNull();
  });

  it("turns the filter on, saves it, and closes the menu", async () => {
    renderToolbar();
    renderSelector(true);
    const harness = start();
    await harness.settle();
    const escapes: string[] = [];
    document.addEventListener("keydown", (event) => escapes.push(event.key));

    filterItem()!.click();
    await harness.settle();

    expect(document.documentElement.hasAttribute(FILTER_ATTR)).toBe(true);
    expect(filterItem()?.getAttribute("aria-checked")).toBe("true");
    expect(harness.calls).toContainEqual({
      method: "filter_set",
      input: { onlyUnviewed: true },
    });
    expect(escapes).toEqual(["Escape"]);
  });

  it("turns the filter off again", async () => {
    renderToolbar();
    renderSelector(true);
    const harness = start({ onlyUnviewed: true });
    await harness.settle();
    expect(filterItem()?.getAttribute("aria-checked")).toBe("true");

    filterItem()!.click();
    await harness.settle();

    expect(document.documentElement.hasAttribute(FILTER_ATTR)).toBe(false);
    expect(filterItem()?.getAttribute("aria-checked")).toBe("false");
  });

  it("applies a saved filter without opening the menu", async () => {
    renderToolbar();
    const harness = start({ onlyUnviewed: true });
    await harness.settle();

    expect(document.documentElement.hasAttribute(FILTER_ATTR)).toBe(true);
  });

  it("stops hiding files when the changes panel closes", async () => {
    const toolbar = renderToolbar();
    const harness = start({ onlyUnviewed: true });
    await harness.settle();

    toolbar.remove();
    harness.engine.syncNow();

    expect(document.documentElement.hasAttribute(FILTER_ATTR)).toBe(false);
  });
});

function progressText(): string | null {
  return document.querySelector("[data-diff-viewed-progress]")?.textContent ?? null;
}

describe("review progress", () => {
  it("counts marks across the whole diff, not only rendered cards", async () => {
    renderToolbar();
    renderCard("a.ts", "+8 -4");
    // Two more files bb has not rendered, one of them viewed.
    panel.files.push(fileEntry("b.ts", "+1 -1"), fileEntry("c.ts", "+3 -0"));
    const harness = start({ record: { "a.ts": "+8 -4", "c.ts": "+3 -0" } });
    await harness.settle();

    expect(progressText()).toBe("2/3 viewed");
  });

  it("does not count a mark on a file whose diff has changed", async () => {
    renderToolbar();
    renderCard("a.ts", "+9 -4");
    const harness = start({ record: { "a.ts": "+8 -4" } });
    await harness.settle();

    expect(progressText()).toBe("0/1 viewed");
  });

  it("moves when a file is marked", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts");
    renderCard("b.ts");
    const harness = start();
    await harness.settle();
    expect(progressText()).toBe("0/2 viewed");

    checkboxFor(toggle)!.click();
    await harness.settle();

    expect(progressText()).toBe("1/2 viewed");
  });

  it("goes away with the changes panel", async () => {
    const toolbar = renderToolbar();
    renderCard("a.ts");
    const harness = start();
    await harness.settle();

    toolbar.remove();
    harness.engine.syncNow();

    expect(progressText()).toBeNull();
  });
});

describe("pruning", () => {
  it("keeps marks on files bb has not rendered yet", async () => {
    renderToolbar();
    renderCard("a.ts", "+8 -4");
    panel.files.push(fileEntry("b.ts", "+1 -1"));
    const harness = start({
      record: { "a.ts": "+8 -4", "b.ts": "+1 -1", "gone.ts": "+2 -2" },
    });
    await harness.settle();
    await harness.settle();

    expect(harness.calls).toContainEqual({
      method: "viewed_prune",
      input: { threadId: "thr_a", presentPaths: ["a.ts", "b.ts"] },
    });
  });

  it("does not prune from a narrower range than All changes", async () => {
    panel.targetType = "uncommitted";
    renderToolbar();
    renderCard("a.ts");
    const harness = start({ record: { "b.ts": "+1 -1" } });
    await harness.settle();
    await harness.settle();

    expect(harness.calls.map((call) => call.method)).not.toContain("viewed_prune");
  });
});

describe("when bb's file list cannot be read", () => {
  function renderUnreadableCard(): void {
    renderCard("a.ts");
    const row = document.querySelector("[data-index]")!;
    delete (row as unknown as Record<string, unknown>).__reactFiber$test;
  }

  it("says so in the toolbar instead of hiding the progress", async () => {
    renderToolbar();
    renderUnreadableCard();
    const harness = start({ warnings: [] });
    await harness.settle();

    expect(progressText()).toBe("Viewed progress unavailable");
    const line = document.querySelector<HTMLElement>("[data-diff-viewed-progress]");
    expect(line?.title).toContain("the row carries no React fiber");
  });

  it("logs the problem to the server once", async () => {
    renderToolbar();
    renderUnreadableCard();
    const warnings: unknown[] = [];
    const harness = start({ warnings });
    await harness.settle();
    harness.engine.syncNow();
    harness.engine.syncNow();

    const reports = harness.calls.filter((call) => call.method === "problem_report");
    expect(reports).toEqual([
      {
        method: "problem_report",
        input: {
          message:
            "Could not read the changes panel's file list: the row carries no React fiber",
        },
      },
    ]);
    expect(warnings).toHaveLength(1);
  });

  it("does not prune", async () => {
    renderToolbar();
    renderUnreadableCard();
    const harness = start({ warnings: [], record: { "b.ts": "+1 -1" } });
    await harness.settle();
    await harness.settle();

    expect(harness.calls.map((call) => call.method)).not.toContain("viewed_prune");
  });

  it("keeps the Viewed checkboxes working", async () => {
    renderToolbar();
    renderUnreadableCard();
    const harness = start({ warnings: [] });
    await harness.settle();

    expect(document.querySelector(`label[${OWNED_ATTR}] input`)).not.toBeNull();
  });
});

describe("syncing with GitHub", () => {
  const pull = (files: GithubState["files"]): GithubState => ({
    number: 42,
    url: "https://github.com/acme/widgets/pull/42",
    files,
  });

  function localTag(toggle: HTMLButtonElement): HTMLElement | null {
    return toggle.parentElement!.parentElement!.querySelector("[data-diff-viewed-local]");
  }

  it("checks a file GitHub has marked viewed", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts", "+8 -4");
    const harness = start({
      github: pull([{ path: "a.ts", additions: 8, deletions: 4, viewed: true }]),
    });
    await harness.settle();

    expect(checkboxFor(toggle)!.checked).toBe(true);
    expect(isCollapsed(toggle)).toBe(true);
    expect(localTag(toggle)!.hidden).toBe(true);
  });

  it("unchecks a file GitHub has unmarked, even with a local mark", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts", "+8 -4");
    const harness = start({
      record: { "a.ts": "+8 -4" },
      github: pull([{ path: "a.ts", additions: 8, deletions: 4, viewed: false }]),
    });
    await harness.settle();

    expect(checkboxFor(toggle)!.checked).toBe(false);
  });

  it("shows the Local icon on a file whose diff differs from GitHub's, and keeps it checkable", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts", "+9 -4");
    const harness = start({
      github: pull([{ path: "a.ts", additions: 8, deletions: 4, viewed: true }]),
    });
    await harness.settle();

    expect(checkboxFor(toggle)!.checked).toBe(false);
    expect(localTag(toggle)!.hidden).toBe(false);
    expect(localTag(toggle)!.getAttribute("aria-label")).toBe("Local");
    expect(localTag(toggle)!.querySelector("svg")).not.toBeNull();
    expect(localTag(toggle)!.closest("label")!.title).toMatch(/^Local: .*differs from pull request #42/);

    checkboxFor(toggle)!.click();
    await harness.settle();
    expect(checkboxFor(toggle)!.checked).toBe(true);
    expect(harness.record).toEqual({ "a.ts": "+9 -4" });
  });

  it("shows the Local icon without a pull request", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts");
    const harness = start();
    await harness.settle();

    expect(localTag(toggle)!.hidden).toBe(false);
    expect(localTag(toggle)!.closest("label")!.title).toMatch(/^Local: .*open pull request/);
  });

  it("counts GitHub's marks in the progress", async () => {
    renderToolbar();
    renderCard("a.ts", "+8 -4");
    renderCard("b.ts", "+1 -1");
    const harness = start({
      github: pull([
        { path: "a.ts", additions: 8, deletions: 4, viewed: true },
        { path: "b.ts", additions: 1, deletions: 1, viewed: false },
      ]),
    });
    await harness.settle();

    expect(document.querySelector("[data-diff-viewed-progress]")!.textContent).toContain("1/2 viewed");
  });

  it("refetches on refresh", async () => {
    renderToolbar();
    renderCard("a.ts");
    const harness = start();
    await harness.settle();
    const before = harness.calls.filter((call) => call.method === "viewed_list").length;

    harness.engine.refresh();
    await harness.settle();
    expect(harness.calls.filter((call) => call.method === "viewed_list")).toHaveLength(before + 1);
  });
});

describe("while GitHub is still answering", () => {
  const pull = (files: GithubState["files"]): GithubState => ({
    number: 42,
    url: "https://github.com/acme/widgets/pull/42",
    files,
  });

  function localIcon(toggle: HTMLButtonElement): HTMLElement {
    return toggle.parentElement!.parentElement!.querySelector("[data-diff-viewed-local]")!;
  }

  function gate(): { promise: Promise<void>; open: () => void } {
    let open = () => {};
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  }

  it("shows bb's marks at once and no Local icon until GitHub answers", async () => {
    renderToolbar();
    const synced = renderCard("a.ts", "+8 -4");
    const local = renderCard("b.ts", "+1 -1");
    const list = gate();
    const harness = start({
      record: { "b.ts": "+1 -1" },
      github: pull([{ path: "a.ts", additions: 8, deletions: 4, viewed: true }]),
      listGate: list.promise,
    });
    await harness.settle();

    expect(checkboxFor(local)!.checked).toBe(true);
    expect(localIcon(synced).hidden).toBe(true);
    expect(localIcon(local).hidden).toBe(true);
    expect(localIcon(local).closest("label")!.title).toMatch(/^Checking GitHub/);
    const progress = document.querySelector("[data-diff-viewed-progress]") as HTMLElement;
    expect(progress.textContent).toContain("1/2 viewed");
    expect(progress.title).toMatch(/Checking GitHub$/);

    list.open();
    await harness.settle();
    await harness.settle();
    expect(checkboxFor(synced)!.checked).toBe(true);
    expect(localIcon(synced).hidden).toBe(true);
    expect(localIcon(local).hidden).toBe(false);
    expect(progress.textContent).toContain("2/2 viewed");
    expect(progress.title).toBe("2 of 2 files viewed");
  });

  it("shows the Local icon once the server says nothing syncs", async () => {
    renderToolbar();
    const toggle = renderCard("a.ts");
    const list = gate();
    const harness = start({ listGate: list.promise });
    await harness.settle();
    expect(localIcon(toggle).hidden).toBe(true);

    list.open();
    await harness.settle();
    await harness.settle();
    expect(localIcon(toggle).hidden).toBe(false);
  });
});

// @vitest-environment jsdom
//
// The loop driven against a project header shaped like bb's
// `TopLevelSidebarSection.tsx`: trailing controls holding a hover-actions span,
// which holds the row controls with New thread.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startEngine, type Engine, type EngineDeps } from "./engine";
import type { CheckoutStatus, ProjectCheckout } from "./rules";
import { INDICATOR_ATTR } from "./sidebar";

const status = (overrides: Partial<CheckoutStatus> = {}): CheckoutStatus => ({
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  error: null,
  ...overrides,
});

function renderProject(id: string, name: string): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("data-sidebar-project-id", id);
  row.innerHTML = `
    <div class="bb-sidebar-hover-actions-row">
      <span><span>${name}</span></span>
      <span data-sidebar-trailing-controls="">
        <span class="bb-sidebar-hover-actions" data-hover>
          <span data-sidebar-row-controls="">
            <button type="button" class="sidebar-control" aria-label="New thread in ${name}"><svg class="size-4"></svg></button>
            <button type="button" aria-label="${name} actions"></button>
          </span>
        </span>
      </span>
    </div>`;
  document.body.append(row);
  return row;
}

const indicatorIn = (row: HTMLElement) =>
  row.querySelector<HTMLButtonElement>(`button[${INDICATOR_ATTR}]`);

let controller: AbortController;
let engine: Engine;
let pending: (() => void)[];
let checkouts: Record<string, ProjectCheckout>;
let loadStatus: ReturnType<typeof vi.fn<EngineDeps["loadStatus"]>>;
let pull: ReturnType<typeof vi.fn<EngineDeps["pull"]>>;

async function settle(): Promise<void> {
  for (let guard = 0; guard < 20; guard += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (pending.length === 0) return;
    const queued = pending;
    pending = [];
    for (const run of queued) run();
  }
}

function start(): void {
  engine = startEngine({
    signal: controller.signal,
    doc: document,
    defer: (run) => {
      pending.push(run);
      return () => {
        pending = pending.filter((queued) => queued !== run);
      };
    },
    wait: () => () => {},
    hidden: () => false,
    loadStatus,
    pull,
    warn: () => {},
  });
}

beforeEach(() => {
  controller = new AbortController();
  pending = [];
  checkouts = {
    proj_widgets: { name: "widgets", status: status({ behind: 3 }) },
    proj_gadgets: { name: "gadgets", status: status() },
    proj_loose: { name: "loose", status: null },
  };
  loadStatus = vi.fn(async (ids) =>
    Object.fromEntries(ids.filter((id) => id in checkouts).map((id) => [id, checkouts[id]!])),
  );
  pull = vi.fn(async (id) => ({ ...checkouts[id]!, status: status() }));
});

afterEach(() => {
  engine.dispose();
  controller.abort();
  document.body.innerHTML = "";
});

describe("checkout sync", () => {
  it("draws before the hover actions, showing only on hover, with a dot when behind", async () => {
    const widgets = renderProject("proj_widgets", "widgets");
    start();
    await settle();

    const indicator = indicatorIn(widgets)!;
    expect(indicator.nextElementSibling?.hasAttribute("data-hover")).toBe(true);
    expect(indicator.classList.contains("bb-sidebar-hover-actions")).toBe(true);
    expect(indicator.querySelector("[data-checkout-sync-dot]")).not.toBeNull();
    expect(indicator.getAttribute("aria-label")).toBe(
      "widgets: main is 3 commits behind origin/main. Click to pull.",
    );
  });

  it("shows an up-to-date checkout only on hover, and none for a project with nothing to compare", async () => {
    const gadgets = renderProject("proj_gadgets", "gadgets");
    const loose = renderProject("proj_loose", "loose");
    start();
    await settle();

    expect(indicatorIn(gadgets)?.classList.contains("bb-sidebar-hover-actions")).toBe(true);
    expect(indicatorIn(gadgets)?.querySelector("[data-checkout-sync-dot]")).toBeNull();
    expect(indicatorIn(loose)).toBeNull();
  });

  it("pulls on click, spinning until it is done", async () => {
    const widgets = renderProject("proj_widgets", "widgets");
    let finish: (value: ProjectCheckout) => void = () => {};
    pull.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    start();
    await settle();

    indicatorIn(widgets)!.click();
    await settle();
    expect(pull).toHaveBeenCalledWith("proj_widgets");
    expect(indicatorIn(widgets)!.disabled).toBe(true);
    expect(indicatorIn(widgets)!.querySelector("svg")!.classList.contains("animate-spin")).toBe(true);
    expect(indicatorIn(widgets)!.classList.contains("bb-sidebar-hover-actions")).toBe(false);
    expect(indicatorIn(widgets)!.getAttribute("aria-label")).toBe("widgets: fetching from origin/main…");

    finish({ name: "widgets", status: status() });
    await settle();
    expect(indicatorIn(widgets)!.disabled).toBe(false);
    expect(indicatorIn(widgets)!.getAttribute("data-tone")).toBe("synced");
    expect(indicatorIn(widgets)!.classList.contains("bb-sidebar-hover-actions")).toBe(true);
  });

  it("keeps spinning while the sync script a pull started runs, and shows its failure", async () => {
    const widgets = renderProject("proj_widgets", "widgets");
    const log = "/tmp/widgets.log";
    pull.mockResolvedValue({
      name: "widgets",
      status: status(),
      run: { script: "sync.sh", state: "running", exitCode: null, log },
    });
    start();
    await settle();

    indicatorIn(widgets)!.click();
    await settle();
    expect(indicatorIn(widgets)!.disabled).toBe(true);
    expect(indicatorIn(widgets)!.querySelector("svg")!.classList.contains("animate-spin")).toBe(true);
    expect(indicatorIn(widgets)!.getAttribute("aria-label")).toBe(
      `widgets: running sync.sh. Output: ${log}`,
    );

    checkouts.proj_widgets = {
      name: "widgets",
      status: status(),
      run: { script: "sync.sh", state: "failed", exitCode: 1, log },
    };
    await engine.refresh();
    await settle();
    expect(indicatorIn(widgets)!.disabled).toBe(false);
    expect(indicatorIn(widgets)!.getAttribute("data-tone")).toBe("error");
    expect(indicatorIn(widgets)!.querySelector("[data-checkout-sync-dot]")).not.toBeNull();
  });

  it("loads a project row that appears later, once", async () => {
    start();
    await settle();
    expect(loadStatus).not.toHaveBeenCalled();

    const widgets = renderProject("proj_widgets", "widgets");
    renderProject("proj_unknown", "unknown");
    await settle();
    expect(indicatorIn(widgets)).not.toBeNull();
    expect(loadStatus).toHaveBeenCalledTimes(1);

    engine.syncNow();
    await settle();
    expect(loadStatus).toHaveBeenCalledTimes(1);
  });

  it("removes its indicators when disposed", async () => {
    const widgets = renderProject("proj_widgets", "widgets");
    start();
    await settle();
    engine.dispose();
    expect(indicatorIn(widgets)).toBeNull();
  });
});

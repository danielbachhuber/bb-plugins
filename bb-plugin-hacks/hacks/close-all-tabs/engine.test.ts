// @vitest-environment jsdom
//
// The loop driven against a tab row shaped like bb's side panel, with a fake
// bb standing in for React: clicking a tab's close button removes its tab.
import { afterEach, describe, expect, it } from "vitest";
import { BUTTON_ATTR, LABEL, startEngine, type Engine } from "./engine";

let engine: Engine | null = null;

afterEach(() => {
  engine?.dispose();
  engine = null;
  document.body.innerHTML = "";
});

function start(): Engine {
  engine = startEngine({
    signal: new AbortController().signal,
    doc: document,
    defer: () => () => {},
  });
  return engine;
}

/** bb's top chrome: pinned tabs, the tab strip, then the "+" button. */
function renderRow(tabs: string[], pinned: string[] = []): HTMLElement {
  const row = document.createElement("div");
  row.innerHTML = `
    ${pinned.map((label) => `<button aria-label="${label}"></button>`).join("")}
    <div data-testid="secondary-panel-tab-strip"><div data-secondary-panel-tab-content></div></div>
    <button data-panel-new-tab class="new-tab-classes" aria-label="New tab"><svg class="icon-classes" data-icon-root=""><path stroke-width="1.5"></path></svg></button>`;
  document.body.append(row);
  const content = row.querySelector("[data-secondary-panel-tab-content]")!;
  for (const label of tabs) {
    const tab = document.createElement("div");
    tab.setAttribute("data-tab-pill", "");
    tab.innerHTML = `<button>${label}</button><button data-tab-pill-close aria-label="Close ${label}"></button>`;
    tab
      .querySelector("[data-tab-pill-close]")!
      .addEventListener("click", () => tab.remove());
    content.append(tab);
  }
  return row;
}

const strip = () =>
  document.querySelector('[data-testid="secondary-panel-tab-strip"]')!;
const closeAll = () =>
  document.querySelector<HTMLButtonElement>(`[${BUTTON_ATTR}]`);
const tabCount = () => document.querySelectorAll("[data-tab-pill]").length;

describe("close all tabs", () => {
  it("adds nothing for a single tab", () => {
    renderRow(["README.md"]);
    start().syncNow();
    expect(closeAll()).toBeNull();
  });

  it("adds the button between the strip and the + button for two tabs", () => {
    renderRow(["README.md", "app.tsx"]);
    start().syncNow();
    const button = closeAll()!;
    expect(button.getAttribute("aria-label")).toBe(LABEL);
    expect(button.previousElementSibling).toBe(strip());
    expect(button.nextElementSibling?.hasAttribute("data-panel-new-tab")).toBe(
      true,
    );
    expect(button.className).toBe("new-tab-classes");
    const icon = button.querySelector("svg")!;
    expect(icon.getAttribute("class")).toBe("icon-classes");
    expect(icon.hasAttribute("data-icon-root")).toBe(true);
    expect(icon.getAttribute("stroke-width")).toBe("1.5");
  });

  it("closes every closable tab and leaves the pinned ones", () => {
    renderRow(["README.md", "app.tsx", "Pull request"], ["Overview"]);
    start().syncNow();
    closeAll()!.click();
    expect(tabCount()).toBe(0);
    expect(document.querySelector('[aria-label="Overview"]')).not.toBeNull();
  });

  it("removes the button once fewer than two tabs remain", () => {
    renderRow(["README.md", "app.tsx"]);
    const e = start();
    e.syncNow();
    document.querySelector<HTMLButtonElement>("[data-tab-pill-close]")!.click();
    e.syncNow();
    expect(closeAll()).toBeNull();
  });

  it("adds only one button across repeated passes", () => {
    renderRow(["README.md", "app.tsx"]);
    const e = start();
    e.syncNow();
    e.syncNow();
    expect(document.querySelectorAll(`[${BUTTON_ATTR}]`)).toHaveLength(1);
  });

  it("moves the button back beside a strip React put after it", () => {
    const row = renderRow(["README.md", "app.tsx"]);
    const e = start();
    e.syncNow();
    const old = closeAll()!;
    // React remounting the strip inserts it before the + button, after ours.
    row.insertBefore(strip(), row.querySelector("[data-panel-new-tab]"));
    e.syncNow();
    expect(old.isConnected).toBe(false);
    expect(closeAll()!.previousElementSibling).toBe(strip());
  });

  it("removes its button on dispose", () => {
    renderRow(["README.md", "app.tsx"]);
    const e = start();
    e.syncNow();
    e.dispose();
    engine = null;
    expect(closeAll()).toBeNull();
  });
});

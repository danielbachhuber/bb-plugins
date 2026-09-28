// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { startEngine } from "./engine";
import { ROW_ATTR, SHELF_PATH } from "./sidebar";

// bb 0.43's Plugins sidebar as it renders, with the long Tailwind class lists
// cut down to the classes that differ between an active and an idle row.
const ROW_CLASSES = "flex items-center gap-2 rounded-md text-sm pl-2 hover:bg-sidebar-accent w-full";
function fixture(active: "browse" | "installed") {
  const row = (href: string, label: string, isActive: boolean) =>
    `<a ${isActive ? 'aria-current="page" ' : ""}class="${ROW_CLASSES}${
      isActive ? " bg-sidebar-accent text-sidebar-foreground" : " text-sidebar-foreground"
    }" href="${href}" data-discover="true"><span class="min-w-0 flex-1 truncate text-left">${label}</span></a>`;
  return `
<div class="mt-1 space-y-0.5">
  ${row("/plugins", "Browse plugins", active === "browse")}
  ${row("/plugins?view=installed", "Installed plugins", active === "installed")}
</div>`;
}

// Every engine started in a test, so none outlives it and reacts to the next
// test's DOM.
const started: { dispose: () => void }[] = [];

afterEach(() => {
  for (const engine of started.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

function start(enabled: boolean, navigate: (path: string) => void = () => {}) {
  const controller = new AbortController();
  const engine = startEngine({
    signal: controller.signal,
    doc: document,
    defer: (run) => {
      run();
      return () => {};
    },
    loadShelfEnabled: async () => enabled,
    navigate,
    warn: () => {},
  });
  started.push(engine);
  return { engine, controller };
}

function rows() {
  return [...document.querySelectorAll("a")];
}

describe("plugins-mine-tab", () => {
  it("adds a My plugins row after Installed plugins", async () => {
    document.body.innerHTML = fixture("installed");
    const { engine } = start(true);
    await engine.ready;
    engine.syncNow();
    expect(rows().map((a) => a.textContent)).toEqual([
      "Browse plugins",
      "Installed plugins",
      "My plugins",
    ]);
    const mine = rows()[2]!;
    expect(mine.getAttribute("href")).toBe(SHELF_PATH);
    expect(mine.hasAttribute(ROW_ATTR)).toBe(true);
  });

  it("copies an idle row, so it never looks like the current page", async () => {
    for (const active of ["browse", "installed"] as const) {
      document.body.innerHTML = fixture(active);
      const { engine } = start(true);
      await engine.ready;
      engine.syncNow();
      const mine = document.querySelector(`[${ROW_ATTR}]`)!;
      expect(mine.hasAttribute("aria-current")).toBe(false);
      expect(mine.classList.contains("bg-sidebar-accent")).toBe(false);
      expect(mine.classList.contains("text-sidebar-foreground")).toBe(true);
      engine.dispose();
    }
  });

  it("adds nothing when Plugin Shelf is not installed", async () => {
    document.body.innerHTML = fixture("installed");
    const { engine } = start(false);
    await engine.ready;
    engine.syncNow();
    expect(document.querySelector(`[${ROW_ATTR}]`)).toBeNull();
  });

  it("adds the row once across passes", async () => {
    document.body.innerHTML = fixture("installed");
    const { engine } = start(true);
    await engine.ready;
    engine.syncNow();
    engine.syncNow();
    expect(document.querySelectorAll(`[${ROW_ATTR}]`)).toHaveLength(1);
  });

  it("adds the row when the sidebar appears after mount", async () => {
    const { engine } = start(true);
    await engine.ready;
    document.body.innerHTML = fixture("browse");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector(`[${ROW_ATTR}]`)).not.toBeNull();
  });

  it("navigates in-app on a plain click and leaves a modified click alone", async () => {
    document.body.innerHTML = fixture("installed");
    const visited: string[] = [];
    const { engine } = start(true, (path) => visited.push(path));
    await engine.ready;
    engine.syncNow();
    const mine = document.querySelector(`[${ROW_ATTR}]`) as HTMLAnchorElement;
    const plain = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    mine.dispatchEvent(plain);
    expect(visited).toEqual([SHELF_PATH]);
    expect(plain.defaultPrevented).toBe(true);
    const withMeta = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    mine.dispatchEvent(withMeta);
    expect(visited).toHaveLength(1);
    expect(withMeta.defaultPrevented).toBe(false);
  });

  it("does nothing when the Installed row is missing", async () => {
    document.body.innerHTML = `<div><a href="/plugins">Browse plugins</a></div>`;
    const { engine } = start(true);
    await engine.ready;
    engine.syncNow();
    expect(document.querySelector(`[${ROW_ATTR}]`)).toBeNull();
  });

  it("ignores an Installed link that is not beside a Browse link", async () => {
    document.body.innerHTML = `<div><a href="/plugins?view=installed">Installed plugins</a></div>`;
    const { engine } = start(true);
    await engine.ready;
    engine.syncNow();
    expect(document.querySelector(`[${ROW_ATTR}]`)).toBeNull();
  });

  it("removes the row on dispose", async () => {
    document.body.innerHTML = fixture("installed");
    const { engine } = start(true);
    await engine.ready;
    engine.syncNow();
    engine.dispose();
    expect(document.querySelector(`[${ROW_ATTR}]`)).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { startScreenEngine } from "./engine";
import { ACTIVE_ATTR, MINE_HREF, ROOT_ATTR, ROW_ATTR } from "./dom";

// bb 0.43's Plugins screen as it renders, with the long Tailwind class lists
// cut down to the classes that differ between an active and an idle row.
const ROW = "flex items-center gap-2 rounded-md text-sm pl-2 hover:bg-sidebar-accent w-full";
function screen(active: "browse" | "installed") {
  const row = (href: string, label: string, on: boolean) =>
    `<a ${on ? 'aria-current="page" ' : ""}class="${ROW}${on ? " bg-sidebar-accent text-sidebar-foreground" : " text-sidebar-foreground"}" href="${href}"><span class="min-w-0 flex-1 truncate text-left">${label}</span></a>`;
  return `
<div class="mt-1 space-y-0.5">
  ${row("/plugins", "Browse plugins", active === "browse")}
  ${row("/plugins?view=installed", "Installed plugins", active === "installed")}
</div>
<div id="extensions-main-panel"><div id="bb-content">bb's own page</div></div>`;
}

let path = "/plugins";
const started: { dispose: () => void }[] = [];
let mounted: (HTMLElement | null)[] = [];

function start(navigate: (to: string) => void = (to) => (path = to)) {
  const controller = new AbortController();
  mounted = [];
  const engine = startScreenEngine({
    signal: controller.signal,
    doc: document,
    location: () => {
      const url = new URL(path, "http://bb.test");
      return { pathname: url.pathname, search: url.search };
    },
    defer: (run) => {
      run();
      return () => {};
    },
    navigate,
    onPanel: (container) => mounted.push(container),
  });
  started.push(engine);
  return engine;
}

afterEach(() => {
  for (const engine of started.splice(0)) engine.dispose();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  path = "/plugins";
});

const mine = () => document.querySelector<HTMLAnchorElement>(`[${ROW_ATTR}]`);
const browse = () => document.querySelector<HTMLAnchorElement>('a[href="/plugins"]')!;
const panel = () => document.getElementById("extensions-main-panel")!;

describe("the My plugins row", () => {
  it("goes after Installed plugins and links to the in-screen view", () => {
    document.body.innerHTML = screen("installed");
    start().syncNow();
    const labels = [...document.querySelectorAll("a")].map((a) => a.textContent);
    expect(labels).toEqual(["Browse plugins", "Installed plugins", "My plugins"]);
    expect(mine()!.getAttribute("href")).toBe(MINE_HREF);
    expect(mine()!.hasAttribute("aria-current")).toBe(false);
  });

  it("is the active row on the in-screen view, and Browse is not", () => {
    // bb falls back to Browse for a view it does not know, so it marks Browse.
    path = MINE_HREF;
    document.body.innerHTML = screen("browse");
    start().syncNow();
    expect(mine()!.getAttribute("aria-current")).toBe("page");
    expect(mine()!.classList.contains("bg-sidebar-accent")).toBe(true);
    expect(browse().hasAttribute("aria-current")).toBe(false);
    expect(browse().classList.contains("bg-sidebar-accent")).toBe(false);
  });

  it("gives Browse its highlight back on leaving, since bb does not re-render it", () => {
    path = MINE_HREF;
    document.body.innerHTML = screen("browse");
    const engine = start();
    engine.syncNow();
    path = "/plugins";
    engine.syncNow();
    expect(browse().getAttribute("aria-current")).toBe("page");
    expect(browse().classList.contains("bg-sidebar-accent")).toBe(true);
    expect(mine()!.hasAttribute("aria-current")).toBe(false);
    expect(mine()!.classList.contains("bg-sidebar-accent")).toBe(false);
  });

  it("navigates in-app on a plain click and leaves a modified click alone", () => {
    document.body.innerHTML = screen("installed");
    const visited: string[] = [];
    start((to) => visited.push(to)).syncNow();
    const plain = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    mine()!.dispatchEvent(plain);
    expect(visited).toEqual([MINE_HREF]);
    expect(plain.defaultPrevented).toBe(true);
    const withMeta = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    mine()!.dispatchEvent(withMeta);
    expect(visited).toHaveLength(1);
  });

  it("is added once, and again when bb draws the sidebar later", async () => {
    const engine = start();
    document.body.innerHTML = screen("installed");
    await new Promise((resolve) => setTimeout(resolve, 0));
    engine.syncNow();
    expect(document.querySelectorAll(`[${ROW_ATTR}]`)).toHaveLength(1);
  });

  it("ignores an Installed link that is not beside a Browse link", () => {
    document.body.innerHTML = `<div><a href="/plugins?view=installed">Installed plugins</a></div>`;
    start().syncNow();
    expect(mine()).toBeNull();
  });
});

describe("the in-screen page", () => {
  it("hides bb's page and hands over a container on the in-screen view", () => {
    path = MINE_HREF;
    document.body.innerHTML = screen("browse");
    start().syncNow();
    const root = panel().querySelector(`[${ROOT_ATTR}]`) as HTMLElement;
    expect(root).not.toBeNull();
    expect(mounted.at(-1)).toBe(root);
    expect(panel().hasAttribute(ACTIVE_ATTR)).toBe(true);
    // Hidden with a stylesheet rule, so content bb renders later is hidden too.
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(css).toContain(`[${ACTIVE_ATTR}]`);
    expect(css).toContain(`:not([${ROOT_ATTR}])`);
  });

  it("leaves bb's page alone everywhere else", () => {
    path = "/plugins?view=installed";
    document.body.innerHTML = screen("installed");
    start().syncNow();
    expect(panel().querySelector(`[${ROOT_ATTR}]`)).toBeNull();
    expect(panel().hasAttribute(ACTIVE_ATTR)).toBe(false);
    expect(mounted.every((c) => c === null)).toBe(true);
  });

  it("restores bb's page on leaving", () => {
    path = MINE_HREF;
    document.body.innerHTML = screen("browse");
    const engine = start();
    engine.syncNow();
    path = "/plugins";
    engine.syncNow();
    expect(panel().querySelector(`[${ROOT_ATTR}]`)).toBeNull();
    expect(panel().hasAttribute(ACTIVE_ATTR)).toBe(false);
    expect(mounted.at(-1)).toBeNull();
  });

  it("hands over one container across passes", () => {
    path = MINE_HREF;
    document.body.innerHTML = screen("browse");
    const engine = start();
    engine.syncNow();
    engine.syncNow();
    expect(panel().querySelectorAll(`[${ROOT_ATTR}]`)).toHaveLength(1);
    expect(mounted.filter((c) => c !== null)).toHaveLength(1);
  });

  it("does nothing when bb has no main panel to draw into", () => {
    path = MINE_HREF;
    document.body.innerHTML = `<div id="something-else"></div>`;
    start().syncNow();
    expect(document.querySelector(`[${ROOT_ATTR}]`)).toBeNull();
    expect(mounted.every((c) => c === null)).toBe(true);
  });

  it("cleans up everything on dispose", () => {
    path = MINE_HREF;
    document.body.innerHTML = screen("browse");
    const engine = start();
    engine.syncNow();
    engine.dispose();
    expect(mine()).toBeNull();
    expect(document.querySelector(`[${ROOT_ATTR}]`)).toBeNull();
    expect(panel().hasAttribute(ACTIVE_ATTR)).toBe(false);
    expect(browse().getAttribute("aria-current")).toBe("page");
  });
});

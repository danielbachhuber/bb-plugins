// @vitest-environment jsdom
//
// The loop driven against a sidebar shaped like bb's: a project row holding
// its header controls, and an environment group nested inside it with row
// controls of its own. The markup follows `ProjectRow.tsx`,
// `TopLevelSidebarSection.tsx`, and `SidebarRowControls.tsx` in bb.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startEngine, type Engine, type EngineDeps, type Machine } from "./engine";
import type { OpenTarget, Project } from "./rules";
import { BUTTON_ATTR } from "./sidebar";

const HOST = "host_here";

const target = (id: string, label: string, kind: string): OpenTarget => ({
  id,
  label,
  kind,
  capabilities: { openDirectory: true },
});

const MACHINE: Machine = {
  hostId: HOST,
  targets: [
    target("finder", "Finder", "file-manager"),
    target("vscode", "VS Code", "editor"),
    target("zed", "Zed", "editor"),
  ],
};

const project = (id: string, name: string, path: string | null): Project => ({
  id,
  name,
  sources:
    path === null
      ? []
      : [{ type: "local_path", hostId: HOST, path, isDefault: true }],
});

function renderProject(
  id: string,
  name: string,
  options: { newThread?: boolean } = {},
): HTMLElement {
  const { newThread = true } = options;
  const row = document.createElement("div");
  row.setAttribute("data-sidebar-project-id", id);
  row.innerHTML = `
    <section>
      <span>${name}</span>
      <span data-sidebar-hover-actions-mobile="true">
        <span data-sidebar-row-controls="">
          ${
            newThread
              ? `<button type="button" class="sidebar-control" aria-label="New thread in ${name}"><svg class="size-4"></svg></button>`
              : ""
          }
          <button type="button" aria-label="${name} actions"></button>
        </span>
      </span>
      <div>
        <span data-sidebar-row-controls="">
          <button type="button" aria-label="New thread in environment"></button>
          <button type="button" aria-label="Environment actions"></button>
        </span>
      </div>
    </section>`;
  document.body.append(row);
  return row;
}

const buttonsIn = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLButtonElement>(`button[${BUTTON_ATTR}]`));

let controller: AbortController;
let started: Engine[] = [];
let pending: (() => void)[] = [];
let preferred: string | null;
let projects: Project[];
let open: ReturnType<typeof vi.fn<EngineDeps["open"]>>;
let loadProjects: ReturnType<typeof vi.fn<EngineDeps["loadProjects"]>>;

async function settle(): Promise<void> {
  for (let guard = 0; guard < 20; guard += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (pending.length === 0) return;
    const queued = pending;
    pending = [];
    for (const run of queued) run();
  }
}

async function start(machine: Machine | null = MACHINE): Promise<Engine> {
  const engine = startEngine({
    signal: controller.signal,
    doc: document,
    defer: (run) => {
      pending.push(run);
      return () => {
        pending = pending.filter((queued) => queued !== run);
      };
    },
    loadMachine: async () => machine,
    loadProjects,
    readPreferredTarget: () => preferred,
    open,
    warn: () => {},
  });
  started.push(engine);
  await engine.ready;
  await settle();
  return engine;
}

beforeEach(() => {
  controller = new AbortController();
  started = [];
  pending = [];
  preferred = null;
  projects = [
    project("proj_widgets", "widgets", "/src/widgets"),
    project("proj_gadgets", "gadgets", null),
  ];
  open = vi.fn<EngineDeps["open"]>(async () => {});
  loadProjects = vi.fn<EngineDeps["loadProjects"]>(async () => projects);
});

afterEach(() => {
  for (const engine of started) engine.dispose();
  controller.abort();
  document.body.innerHTML = "";
});

describe("placing the button", () => {
  it("adds one button to the project header, before New thread", async () => {
    const row = renderProject("proj_widgets", "widgets");
    await start();

    const buttons = buttonsIn(row);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.nextElementSibling?.getAttribute("aria-label")).toBe(
      "New thread in widgets",
    );
  });

  it("copies bb's button and icon classes", async () => {
    const row = renderProject("proj_widgets", "widgets");
    await start();

    const button = buttonsIn(row)[0]!;
    expect(button.className).toBe("sidebar-control");
    expect(button.querySelector("svg")?.getAttribute("class")).toBe("size-4");
  });

  it("names the project and the editor", async () => {
    const row = renderProject("proj_widgets", "widgets");
    await start();

    expect(buttonsIn(row)[0]!.getAttribute("aria-label")).toBe(
      "Open widgets in VS Code",
    );
  });

  it("uses bb's preferred editor", async () => {
    preferred = "zed";
    const row = renderProject("proj_widgets", "widgets");
    await start();

    expect(buttonsIn(row)[0]!.getAttribute("aria-label")).toBe(
      "Open widgets in Zed",
    );
  });

  it("skips a project with no checkout on this machine", async () => {
    const row = renderProject("proj_gadgets", "gadgets");
    await start();

    expect(buttonsIn(row)).toHaveLength(0);
  });

  it("skips a project whose folder is missing, where bb hides New thread", async () => {
    const row = renderProject("proj_widgets", "widgets", { newThread: false });
    await start();

    expect(buttonsIn(row)).toHaveLength(0);
  });

  it("adds nothing when no host daemon is reachable", async () => {
    const row = renderProject("proj_widgets", "widgets");
    await start(null);

    expect(buttonsIn(row)).toHaveLength(0);
  });

  it("puts the button back after bb re-renders the header", async () => {
    const row = renderProject("proj_widgets", "widgets");
    const engine = await start();
    buttonsIn(row)[0]!.remove();
    engine.syncNow();

    expect(buttonsIn(row)).toHaveLength(1);
  });

  it("removes its buttons when disposed", async () => {
    const row = renderProject("proj_widgets", "widgets");
    const engine = await start();
    engine.dispose();

    expect(buttonsIn(row)).toHaveLength(0);
  });
});

describe("clicking", () => {
  it("opens the project's checkout in the editor", async () => {
    const row = renderProject("proj_widgets", "widgets");
    await start();
    buttonsIn(row)[0]!.click();

    expect(open).toHaveBeenCalledWith("/src/widgets", "vscode");
  });

  it("uses the preference as it stands at click time", async () => {
    const row = renderProject("proj_widgets", "widgets");
    await start();
    preferred = "zed";
    buttonsIn(row)[0]!.click();

    expect(open).toHaveBeenCalledWith("/src/widgets", "zed");
  });

  it("does not reach the project row's own click handler", async () => {
    const row = renderProject("proj_widgets", "widgets");
    const onRowClick = vi.fn();
    row.addEventListener("click", onRowClick);
    await start();
    buttonsIn(row)[0]!.click();

    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("projects that change", () => {
  it("reloads projects when a new one appears in the sidebar", async () => {
    renderProject("proj_widgets", "widgets");
    const engine = await start();
    projects = [...projects, project("proj_new", "new-thing", "/src/new")];
    const row = renderProject("proj_new", "new-thing");
    engine.syncNow();
    await settle();

    expect(buttonsIn(row)).toHaveLength(1);
  });

  it("does not keep reloading for a project it can never match", async () => {
    renderProject("proj_widgets", "widgets", { newThread: false });
    const engine = await start();
    const loads = loadProjects.mock.calls.length;
    engine.syncNow();
    engine.syncNow();
    await settle();

    expect(loadProjects.mock.calls.length).toBe(loads);
  });
});

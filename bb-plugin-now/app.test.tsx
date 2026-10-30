// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import { mondayOf } from "./now/priorities.js";
import type { Item } from "./now/types.js";

// jsdom lays nothing out and has no ResizeObserver; the rows only measure
// themselves with it, so one that never fires is enough.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// This jsdom has no localStorage, and the sidebar remembers whether its list is open in it.
if (window.localStorage === undefined) {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
    },
  });
}

const app = await loadPluginApp(() => import("./app.js"));

/** Today as Todoist writes a date, so the rows land in Now rather than the folded Anytime. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function item(overrides: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
    source: "todoist",
    description: "",
    priority: null,
    due: { date: today(), recurring: false },
    deadline: null,
    activityAt: null,
    context: "Widgets",
    tags: [],
    url: `https://app.todoist.com/app/task/${overrides.id}`,
    gmail: null,
    github: null,
    todoist: { projectId: "widgets" },
    ...overrides,
    id: `todoist:${overrides.id}`,
  };
}

const ITEMS = [
  item({ id: "a1", title: "Reply to octocat about the widget launch date" }),
  item({ id: "a2", title: "Review the gadgets pull request" }),
];

const MONDAY = mondayOf(new Date());

/**
 * Why a start fails in the test that makes it fail. The page throws it so bb's
 * composer keeps the draft; the harness's stand-in composer does not catch
 * it, so vitest.config.ts lets exactly this message through.
 */
const FAILED_START = "Test: the thread could not be started.";
const PRIORITY = "Ship the gadget importer";

function listing() {
  return {
    list: { items: ITEMS, sources: [], fetchedAt: new Date().toISOString() },
    threads: {},
    threadProjectId: "proj_a",
    syncing: false,
  };
}

let mounted: { lifecycle: { unmount: () => void } } | null = null;

afterEach(() => {
  mounted?.lifecycle.unmount();
  mounted = null;
  cleanup();
});

const RPC = {
  items_list: () => listing(),
  items_sync: () => ({ synced: false, error: null }),
  todoist_projects: () => ({ projects: [], error: null }),
  items_start_thread: () => ({ threadId: "thr_new", existing: false, error: null }),
};

function render(extraRpc: Record<string, unknown> = {}) {
  const slot = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        items_list: () => listing(),
        items_sync: () => ({ synced: false, error: null }),
        todoist_projects: () => ({ projects: [], error: null }),
        items_start_thread: () => ({ threadId: "thr_new", existing: false, error: null }),
        ...extraRpc,
      },
    },
  );
  mounted = slot;
  return slot;
}

type Slot = ReturnType<typeof render>;

/**
 * Waits for the sync the page runs on open, which redraws the list once it
 * resolves, so a row found before then can be replaced under the test.
 */
async function settled(slot: Slot) {
  await waitFor(() => {
    const methods = slot.inspection.rpcCalls.map((call) => call.method);
    expect(methods).toContain("items_sync");
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The list item holding a row's title, so a query can stay inside one row. */
async function rowFor(slot: Slot, title: string) {
  await settled(slot);
  const text = await slot.findByText(title);
  return text.closest("li")! as HTMLElement;
}

/** The row's own Start thread button, not the composer's submit button of the same name. */
function startButton(row: HTMLElement) {
  return within(row).getAllByRole("button", { name: "Start thread" }).find((button) => !button.dataset.testid)!;
}

describe("Start thread on a row", () => {
  it("opens bb's composer under the row, seeded with the row, rather than spawning", async () => {
    const slot = render();
    const row = await rowFor(slot, ITEMS[0]!.title);
    fireEvent.click(startButton(row));

    const box = await within(row).findByRole("region", { name: "Start a thread" });
    expect(startButton(row)).toHaveAttribute("aria-expanded", "true");
    const composer = within(box).getByTestId("bb-new-thread-composer");
    expect(composer.dataset.defaultProjectId).toBe("proj_a");
    expect(composer.dataset.draftKey).toMatch(/^now:todoist:a1/);
    expect((within(box).getByTestId("bb-new-thread-composer-input") as HTMLTextAreaElement).value).toContain(
      ITEMS[0]!.title,
    );
    expect(slot.inspection.rpcCalls.some((call) => call.method === "items_start_thread")).toBe(false);
  });

  it("closes the box when Start thread is clicked again", async () => {
    const slot = render();
    const row = await rowFor(slot, ITEMS[0]!.title);
    fireEvent.click(startButton(row));
    await within(row).findByRole("region", { name: "Start a thread" });

    fireEvent.click(startButton(row));
    await waitFor(() => expect(within(row).queryByRole("region", { name: "Start a thread" })).toBeNull());
    expect(startButton(row)).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps one box on the page, moving it to the row last clicked", async () => {
    const slot = render();
    const first = await rowFor(slot, ITEMS[0]!.title);
    const second = await rowFor(slot, ITEMS[1]!.title);
    fireEvent.click(startButton(first));
    await within(first).findByRole("region", { name: "Start a thread" });

    fireEvent.click(startButton(second));
    await within(second).findByRole("region", { name: "Start a thread" });
    expect(within(first).queryByRole("region", { name: "Start a thread" })).toBeNull();
    expect(slot.getAllByRole("region", { name: "Start a thread" })).toHaveLength(1);
  });

  it("starts the thread for that row and closes the box", async () => {
    const slot = render();
    const row = await rowFor(slot, ITEMS[0]!.title);
    fireEvent.click(startButton(row));
    const box = await within(row).findByRole("region", { name: "Start a thread" });

    fireEvent.click(within(box).getByTestId("bb-new-thread-composer-submit"));
    await waitFor(() => expect(within(row).queryByRole("region", { name: "Start a thread" })).toBeNull());
    // Open thread, once the thread exists, without waiting for the listing.
    await waitFor(() => expect(within(row).getByRole("button", { name: "Open thread" })).toBeEnabled());
    const call = slot.inspection.rpcCalls.find((entry) => entry.method === "items_start_thread");
    expect((call?.input as { id: string }).id).toBe("todoist:a1");
  });

  it("keeps the box open when the thread could not be started", async () => {
    const slot = render({
      items_start_thread: () => ({ threadId: null, existing: false, error: FAILED_START }),
    });
    const row = await rowFor(slot, ITEMS[0]!.title);
    fireEvent.click(startButton(row));
    const box = await within(row).findByRole("region", { name: "Start a thread" });

    fireEvent.click(within(box).getByTestId("bb-new-thread-composer-submit"));
    await waitFor(() =>
      expect(slot.inspection.rpcCalls.some((entry) => entry.method === "items_start_thread")).toBe(true),
    );
    expect(within(row).getByRole("region", { name: "Start a thread" })).toBeInTheDocument();
  });
});

function week(items: Array<{ text: string; doneAt?: string | null }>) {
  return {
    monday: MONDAY,
    source: "weekly-review",
    heading: null,
    hoursAt: null,
    writtenAt: new Date().toISOString(),
    items: items.map((each) => ({ details: [], hours: null, doneAt: null, ...each })),
  };
}

/** The priorities box in bb's sidebar footer, with the week `priorities_get` answers. */
function renderFooter(priorities: ReturnType<typeof week> | null) {
  const dismissed: number[] = [];
  const slot = renderSlot(
    app.experimentalSidebarFooterItems[0]!,
    { dismiss: () => dismissed.push(1) },
    { rpc: { items_list: () => listing(), priorities_get: () => priorities } },
  );
  mounted = slot;
  return { slot, dismissed };
}

describe("Priorities in the sidebar", () => {
  afterEach(() => window.localStorage.clear());

  it("says how many there are and how many are done, and opens to the priorities", async () => {
    const { slot } = renderFooter(week([{ text: PRIORITY, doneAt: new Date().toISOString() }, { text: "Plan the fall talks" }]));
    const summary = await slot.findByRole("button", { name: /2 priorities this week/ });
    expect(within(summary).getByRole("img", { name: "1 of 2 done" })).toBeInTheDocument();
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(slot.queryByText(PRIORITY)).toBeNull();

    fireEvent.click(summary);
    expect(await slot.findByText(PRIORITY)).toBeInTheDocument();
    expect(window.localStorage.getItem("bb-plugin-now:priorities-open")).toBe("true");
  });

  it("opens bb's new-thread page seeded with the priority, in the threads' project", async () => {
    window.localStorage.setItem("bb-plugin-now:priorities-open", "true");
    const { slot } = renderFooter(week([{ text: PRIORITY }]));
    await waitFor(() => expect(slot.inspection.rpcCalls.map((call) => call.method)).toContain("items_list"));
    fireEvent.click(await slot.findByRole("button", { name: `Start thread: ${PRIORITY}` }));

    const call = (
      slot.inspection.navigateCalls.find((entry) => entry.method === "toCompose") as
        | { options?: { initialPrompt?: string; projectId?: string } }
        | undefined
    )?.options;
    expect(call?.initialPrompt).toContain(PRIORITY);
    expect(call?.projectId).toBe("proj_a");
    expect(slot.inspection.rpcCalls.some((entry) => entry.method === "items_start_thread")).toBe(false);
  });

  it("closes the box in a week with no priorities", async () => {
    const { dismissed } = renderFooter(null);
    await waitFor(() => expect(dismissed).toHaveLength(1));
  });
});

describe("Start thread in the email reader", () => {
  /** The Email tab in the page's side panel, reading the first row's email. */
  function renderEmailTab() {
    const tab = (app.navPanels[0] as unknown as { fixedTabs: { component: unknown }[] }).fixedTabs[0]!;
    const slot = renderSlot({ ...app.navPanels[0]!, component: tab.component } as never, {} as never, {
      rpc: {
        ...RPC,
        email_thread: () => ({
          thread: {
            threadId: "t1",
            subject: "Widget launch date",
            url: "https://mail.google.com/mail/u/0/#inbox/t1",
            messages: [],
          },
          error: null,
        }),
      },
      experimental_fixedTabTarget: { panelId: "now", tabId: "email", target: { id: "todoist:a1" } },
    });
    mounted = slot;
    return slot;
  }

  /** The toolbar's Start thread, not the composer's submit button of the same name. */
  async function toolbarStart(slot: Slot) {
    await slot.findByText("Widget launch date");
    return slot.getAllByRole("button", { name: "Start thread" }).find((button) => !button.dataset.testid)!;
  }

  it("opens the box under the toolbar, and Start thread closes it again", async () => {
    const slot = renderEmailTab();
    fireEvent.click(await toolbarStart(slot));

    const box = await slot.findByRole("region", { name: "Start a thread" });
    expect(await toolbarStart(slot)).toHaveAttribute("aria-expanded", "true");
    expect((within(box).getByTestId("bb-new-thread-composer-input") as HTMLTextAreaElement).value).toContain(
      ITEMS[0]!.title,
    );

    fireEvent.click(await toolbarStart(slot));
    await waitFor(() => expect(slot.queryByRole("region", { name: "Start a thread" })).toBeNull());
  });
});

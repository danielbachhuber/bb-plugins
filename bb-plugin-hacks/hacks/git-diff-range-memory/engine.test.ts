// @vitest-environment jsdom
//
// The loop driven against a DOM shaped like bb's, with a fake bb standing in
// for React: the trigger carries a `__reactFiber$` chain whose props hold the
// ranges and an `onChange`, and picking a range re-renders the trigger's
// label, the way `GitDiffSelector` does. Switching threads is a change of the
// thread id plus bb's own reset to All changes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startEngine, type Engine } from "./engine";
import { SETTLE_MS, type RangeOption } from "./rules";
import type { RangeStore } from "./storage";

const ALL: RangeOption = { value: "all", label: "All changes" };
const COMMITTED: RangeOption = {
  value: "branch_committed",
  label: "Committed changes",
};
const UNCOMMITTED: RangeOption = {
  value: "uncommitted",
  label: "Uncommitted changes",
};

/** A stand-in for bb's dropdown and the React state behind it. */
class FakeSelector {
  value = "all";
  options: RangeOption[] = [ALL];
  readonly changes: string[] = [];
  readonly trigger: HTMLButtonElement;

  constructor() {
    const slot = document.createElement("div");
    slot.setAttribute("data-testid", "git-diff-toolbar-selector-slot");
    this.trigger = document.createElement("button");
    this.trigger.setAttribute("aria-expanded", "false");
    slot.append(this.trigger);
    document.body.append(slot);
    // Radix's trigger, popper, and menu providers sit between the DOM node
    // and the selector: 23 fibers in bb 0.44.
    const selector = this;
    let fiber: Record<string, unknown> = {
      get memoizedProps() {
        return {
          value: selector.value,
          options: selector.options,
          onChange: (value: string) => selector.select(value),
        };
      },
      return: null,
    };
    for (let depth = 0; depth < 23; depth += 1) {
      fiber = { memoizedProps: { children: null }, return: fiber };
    }
    (this.trigger as unknown as Record<string, unknown>)["__reactFiber$test"] =
      fiber;
    this.render();
  }

  select(value: string): void {
    this.changes.push(value);
    this.value = value;
    this.render();
  }

  render(): void {
    const option = this.options.find((entry) => entry.value === this.value);
    this.trigger.textContent = option?.label ?? this.value;
  }

  /** Open the menu and click an item, as the user would. */
  pick(option: RangeOption): void {
    const menu = document.createElement("div");
    menu.id = "radix-menu-1";
    menu.setAttribute("role", "menu");
    for (const entry of this.options) {
      const item = document.createElement("div");
      item.setAttribute("role", "menuitem");
      item.innerHTML = `<span><span>${entry.label}</span></span>`;
      item.addEventListener("click", () => this.select(entry.value));
      menu.append(item);
    }
    document.body.append(menu);
    this.trigger.setAttribute("aria-expanded", "true");
    this.trigger.setAttribute("aria-controls", menu.id);
    const item = [...menu.querySelectorAll('[role="menuitem"]')].find(
      (element) => element.textContent === option.label,
    ) as HTMLElement;
    // The click lands on the label inside the item, as a real one does.
    item.querySelector("span span")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    menu.remove();
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.removeAttribute("aria-controls");
  }
}

function memoryStore(): RangeStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (threadId) => data.get(threadId),
    set: (threadId, value) => {
      if (value === "all") data.delete(threadId);
      else data.set(threadId, value);
    },
  };
}

let controller: AbortController;
let engine: Engine | null;
let clock: number;
let thread: string | null;
let store: ReturnType<typeof memoryStore>;

function start(): Engine {
  engine = startEngine({
    signal: controller.signal,
    doc: document,
    store,
    threadId: () => thread,
    now: () => clock,
    defer: () => () => {},
    after: () => () => {},
  });
  return engine;
}

beforeEach(() => {
  document.body.innerHTML = "";
  controller = new AbortController();
  engine = null;
  clock = 0;
  thread = "thr_a";
  store = memoryStore();
});

afterEach(() => {
  engine?.dispose();
  controller.abort();
});

describe("git-diff range memory", () => {
  it("records the range picked from the menu, per thread", () => {
    const selector = new FakeSelector();
    selector.options = [ALL, COMMITTED, UNCOMMITTED];
    start();
    selector.pick(UNCOMMITTED);
    expect(store.data.get("thr_a")).toBe("uncommitted");
  });

  it("puts the range back after a switch away and back", () => {
    const selector = new FakeSelector();
    selector.options = [ALL, COMMITTED, UNCOMMITTED];
    const loop = start();
    selector.pick(UNCOMMITTED);

    thread = "thr_b";
    selector.select("all");
    loop.syncNow();

    thread = "thr_a";
    selector.select("all");
    loop.syncNow();
    expect(selector.value).toBe("uncommitted");
  });

  it("waits for the stored range to load before selecting it", () => {
    store.set("thr_a", "uncommitted");
    const selector = new FakeSelector();
    const loop = start();
    loop.syncNow();
    expect(selector.changes).toEqual([]);

    selector.options = [ALL, COMMITTED, UNCOMMITTED];
    loop.syncNow();
    expect(selector.value).toBe("uncommitted");
  });

  it("leaves All changes alone when the stored range is gone", () => {
    store.set("thr_a", "uncommitted");
    const selector = new FakeSelector();
    selector.options = [ALL, COMMITTED];
    const loop = start();
    loop.syncNow();

    // Uncommitted edits turn up later in the same visit.
    selector.options = [ALL, COMMITTED, UNCOMMITTED];
    loop.syncNow();
    expect(selector.changes).toEqual([]);
  });

  it("corrects bb's reset when it lands just after the switch", () => {
    store.set("thr_a", "uncommitted");
    const selector = new FakeSelector();
    selector.options = [ALL, UNCOMMITTED];
    selector.value = "uncommitted";
    const loop = start();
    loop.syncNow();
    expect(selector.changes).toEqual([]);

    selector.select("all");
    clock = SETTLE_MS - 1;
    loop.syncNow();
    expect(selector.value).toBe("uncommitted");
  });

  it("stops restoring once the range has held, so bb's own moves stand", () => {
    store.set("thr_a", "uncommitted");
    const selector = new FakeSelector();
    selector.options = [ALL, UNCOMMITTED];
    const loop = start();
    loop.syncNow();
    clock = SETTLE_MS;
    loop.syncNow();

    // A file link in the transcript sends the panel back to All changes.
    selector.select("all");
    loop.syncNow();
    expect(selector.value).toBe("all");
  });

  it("does not overrule a range picked while the stored one loads", () => {
    store.set("thr_a", "uncommitted");
    const selector = new FakeSelector();
    selector.options = [ALL, COMMITTED];
    const loop = start();
    loop.syncNow();
    selector.pick(COMMITTED);

    selector.options = [ALL, COMMITTED, UNCOMMITTED];
    loop.syncNow();
    expect(selector.value).toBe("branch_committed");
    expect(store.data.get("thr_a")).toBe("branch_committed");
  });

  it("forgets the thread when All changes is picked", () => {
    store.set("thr_a", "uncommitted");
    const selector = new FakeSelector();
    selector.options = [ALL, UNCOMMITTED];
    start();
    selector.pick(ALL);
    expect(store.data.has("thr_a")).toBe(false);
  });

  it("does nothing when the selector's props cannot be found", () => {
    store.set("thr_a", "uncommitted");
    const selector = new FakeSelector();
    delete (selector.trigger as unknown as Record<string, unknown>)[
      "__reactFiber$test"
    ];
    expect(() => start().syncNow()).not.toThrow();
  });
});

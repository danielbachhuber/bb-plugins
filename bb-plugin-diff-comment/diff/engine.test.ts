// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCard } from "./fixture";
import { startEngine, DRAFT_ID, TRIGGER_ATTR, type Draft, type EngineDeps } from "./engine";
import { OWNED_ATTR, slotNameFor } from "./dom";
import type { Comment } from "@/comment/types";

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    threadId: "thr_1",
    path: "src/a.ts",
    side: "new",
    line: 2,
    anchor: { text: "const b = 2;", before: "const a = 1;", after: "const c = 3;" },
    body: "why?",
    state: "open",
    reply: null,
    seq: 1,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

const LINES = [
  { line: 1, text: "const a = 1;" },
  { line: 2, text: "const b = 2;" },
  { line: 3, text: "const c = 3;" },
];

interface Harness {
  deps: EngineDeps;
  mountCard: ReturnType<typeof vi.fn>;
  mountComposer: ReturnType<typeof vi.fn>;
  unmountCard: ReturnType<typeof vi.fn>;
  prepareHost: ReturnType<typeof vi.fn>;
  readSelection: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  controller: AbortController;
}

function harness(comments: Comment[], pathname = "/threads/thr_1"): Harness {
  const rpc = vi.fn(async (method: string) => {
    if (method === "comments_list") return { comments };
    return {};
  });
  const mountCard = vi.fn();
  const mountComposer = vi.fn();
  const unmountCard = vi.fn();
  const prepareHost = vi.fn();
  const readSelection = vi.fn(() => "");
  const warn = vi.fn();
  const controller = new AbortController();

  return {
    rpc,
    mountCard,
    mountComposer,
    unmountCard,
    prepareHost,
    readSelection,
    warn,
    controller,
    deps: {
      rpc: rpc as unknown as EngineDeps["rpc"],
      doc: document,
      pathname: () => pathname,
      // Synchronous, so a test can drive passes without timers.
      defer: (run) => {
        run();
        return () => {};
      },
      warn,
      signal: controller.signal,
      mountCard,
      mountComposer,
      unmountCard,
      prepareHost,
      readSelection,
    },
  };
}

/** Let the in-flight comments_list settle, then run another pass. */
async function settle(engine: { syncNow: () => void }): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  engine.syncNow();
}

function ownedRows(host: HTMLElement): number {
  return host.shadowRoot!.querySelectorAll(`[${OWNED_ATTR}][data-line-annotation]`).length;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("startEngine", () => {
  it("puts a row and a card on a comment's line", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);

    expect(ownedRows(host)).toBe(1);
    expect(h.mountCard).toHaveBeenCalledTimes(1);
    const [holder, mounted] = h.mountCard.mock.calls[0]!;
    expect((holder as HTMLElement).getAttribute("slot")).toBe(slotNameFor("c1"));
    expect((mounted as Comment).id).toBe("c1");
    engine.dispose();
  });

  it("prepares every diff on screen, including ones with no comments", async () => {
    // The overlay stylesheet is adopted here. A diff that gets no card must
    // still be prepared, or its hover affordance renders unstyled — which
    // drops it at its static position instead of beside bb's own control.
    const a = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const b = buildCard("src/other.ts", { view: "unified", lines: LINES });
    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);

    const prepared = h.prepareHost.mock.calls.map(([host]) => host);
    expect(prepared).toContain(a.host);
    expect(prepared).toContain(b.host);
    engine.dispose();
  });

  it("leaves a diff for another file alone", async () => {
    const { host } = buildCard("src/other.ts", { view: "unified", lines: LINES });
    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);

    expect(ownedRows(host)).toBe(0);
    expect(h.mountCard).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("does not decorate a timeline diff", async () => {
    const { host, card } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const timeline = document.createElement("div");
    timeline.setAttribute("data-timeline-file-diff", "");
    document.body.append(timeline);
    timeline.append(card);

    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);

    expect(ownedRows(host)).toBe(0);
    engine.dispose();
  });

  it("does not place a comment whose code has gone", async () => {
    const { host } = buildCard("src/a.ts", {
      view: "unified",
      lines: [{ line: 1, text: "const a = 1;" }],
    });
    const h = harness([comment({ anchor: { text: "vanished();", before: null, after: null } })]);
    const engine = startEngine(h.deps);
    await settle(engine);

    expect(ownedRows(host)).toBe(0);
    engine.dispose();
  });

  it("keeps resolved comments off the diff", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([comment({ state: "resolved" })]);
    const engine = startEngine(h.deps);
    await settle(engine);

    expect(ownedRows(host)).toBe(0);
    engine.dispose();
  });

  it("does not remount cards when nothing has changed", async () => {
    // bb re-renders constantly, so every one of those passes must be cheap.
    // Remounting here is what would make a card flicker and lose focus.
    buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);
    expect(h.mountCard).toHaveBeenCalledTimes(1);

    engine.syncNow();
    engine.syncNow();
    expect(h.mountCard).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it("puts the rows back after bb re-renders the diff away", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);
    expect(ownedRows(host)).toBe(1);

    // What a theme change or a view toggle does: the rows are replaced
    // wholesale, taking ours with them.
    for (const node of Array.from(host.shadowRoot!.querySelectorAll(`[${OWNED_ATTR}]`))) {
      node.remove();
    }
    expect(ownedRows(host)).toBe(0);

    engine.syncNow();
    expect(ownedRows(host)).toBe(1);
    engine.dispose();
  });

  it("unmounts a card before removing its holder", async () => {
    buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);

    engine.dispose();
    expect(h.unmountCard).toHaveBeenCalledTimes(1);
  });

  it("leaves no trace of itself once disposed", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);

    engine.dispose();
    expect(host.shadowRoot!.querySelectorAll(`[${OWNED_ATTR}]`)).toHaveLength(0);
    expect(host.querySelectorAll("[slot]")).toHaveLength(0);
  });

  it("refetches for the thread in the route, not the one it started on", async () => {
    buildCard("src/a.ts", { view: "unified", lines: LINES });
    let pathname = "/threads/thr_1";
    const h = harness([comment()]);
    const engine = startEngine({ ...h.deps, pathname: () => pathname });
    await settle(engine);
    expect(h.rpc).toHaveBeenLastCalledWith("comments_list", { threadId: "thr_1" });

    pathname = "/threads/thr_2";
    engine.syncNow();
    expect(h.rpc).toHaveBeenLastCalledWith("comments_list", { threadId: "thr_2" });
    engine.dispose();
  });

  it("does nothing off a thread route", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([comment()], "/settings");
    const engine = startEngine(h.deps);
    await settle(engine);

    expect(h.rpc).not.toHaveBeenCalled();
    expect(ownedRows(host)).toBe(0);
    engine.dispose();
  });

  it("reports a broken diff and carries on with the others", async () => {
    const broken = buildCard("src/a.ts", { view: "unified", lines: LINES });
    // A column with no content stack at all: nothing this plugin can read.
    broken.columns[0]!.querySelector("[data-content]")!.remove();
    const good = buildCard("src/a.ts", { view: "unified", lines: LINES });

    const h = harness([comment()]);
    const engine = startEngine(h.deps);
    await settle(engine);

    expect(ownedRows(good.host)).toBe(1);
    engine.dispose();
  });
});

describe("the hover affordance", () => {
  /** Hovering a line, and the gutter cell the button should land in. */
  function hover(host: HTMLElement, line: number): HTMLElement {
    const root = host.shadowRoot!;
    const row = root.querySelector<HTMLElement>(`[data-line="${line}"]`)!;
    row.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
    return root.querySelector<HTMLElement>(`[data-column-number="${line}"]`)!;
  }

  function press(cell: HTMLElement): void {
    const trigger = cell.querySelector<HTMLElement>(`[${TRIGGER_ATTR}]`)!;
    // Pierre re-renders the row on pointerdown, so the affordance acts on the
    // press rather than waiting for a click that may never arrive.
    trigger.dispatchEvent(new window.Event("pointerdown", { bubbles: true, cancelable: true }));
  }

  it("appears in the gutter, beside bb's own control for that line", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    const cell = hover(host, 2);
    expect(cell.querySelector(`[${TRIGGER_ATTR}]`)).not.toBeNull();
    engine.dispose();
  });

  it("stays put when the pointer moves onto the gutter itself", async () => {
    // Otherwise the button disappears the instant you move towards it.
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    hover(host, 2);
    const cell = host.shadowRoot!.querySelector<HTMLElement>('[data-column-number="2"]')!;
    cell.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
    expect(cell.querySelector(`[${TRIGGER_ATTR}]`)).not.toBeNull();
    engine.dispose();
  });

  it("moves to the next line rather than accumulating", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    const first = hover(host, 1);
    const second = hover(host, 3);
    expect(first.querySelector(`[${TRIGGER_ATTR}]`)).toBeNull();
    expect(second.querySelector(`[${TRIGGER_ATTR}]`)).not.toBeNull();
    expect(host.shadowRoot!.querySelectorAll(`[${TRIGGER_ATTR}]`)).toHaveLength(1);
    engine.dispose();
  });

  it("goes away when the pointer leaves the diff", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    hover(host, 2);
    host.dispatchEvent(new window.Event("pointerleave", { bubbles: false }));
    expect(host.shadowRoot!.querySelector(`[${TRIGGER_ATTR}]`)).toBeNull();
    engine.dispose();
  });

  it("goes away when the window loses focus", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    hover(host, 2);
    window.dispatchEvent(new window.Event("blur"));
    expect(host.shadowRoot!.querySelector(`[${TRIGGER_ATTR}]`)).toBeNull();
    engine.dispose();
  });

  it("opens a composer on the pressed line, with that line's context", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    press(hover(host, 2));

    expect(h.mountComposer).toHaveBeenCalledTimes(1);
    const [holder, draft] = h.mountComposer.mock.calls[0]! as [HTMLElement, Draft];
    expect(holder.getAttribute("slot")).toBe(slotNameFor(DRAFT_ID));
    expect(draft).toMatchObject({
      path: "src/a.ts",
      side: "new",
      line: 2,
      anchor: { text: "const b = 2;", before: "const a = 1;", after: "const c = 3;" },
    });
    engine.dispose();
  });

  it("takes the press before Pierre can start a line selection on it", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    const cell = hover(host, 2);
    const seen = vi.fn();
    host.shadowRoot!.addEventListener("pointerdown", seen);
    press(cell);

    expect(seen).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("puts the button away once the composer is open", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    press(hover(host, 2));
    expect(host.shadowRoot!.querySelector(`[${TRIGGER_ATTR}]`)).toBeNull();
    engine.dispose();
  });

  it("opens the composer with the selected code quoted", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    h.readSelection.mockReturnValue("const b = 2;");
    const engine = startEngine(h.deps);
    await settle(engine);

    press(hover(host, 2));

    const [, draft] = h.mountComposer.mock.calls[0]! as [HTMLElement, Draft];
    expect(draft.body).toBe("> const b = 2;\n\n");
    engine.dispose();
  });

  it("reads the selection from the diff it was made in", async () => {
    const a = buildCard("src/a.ts", { view: "unified", lines: LINES });
    buildCard("src/other.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    press(hover(a.host, 2));
    expect(h.readSelection).toHaveBeenLastCalledWith(a.host);
    engine.dispose();
  });

  it("opens an empty composer when nothing is selected", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    press(hover(host, 2));

    const [, draft] = h.mountComposer.mock.calls[0]! as [HTMLElement, Draft];
    expect(draft.body).toBe("");
    engine.dispose();
  });

  it("drops the draft once a write has landed", async () => {
    const { host } = buildCard("src/a.ts", { view: "unified", lines: LINES });
    const h = harness([]);
    const engine = startEngine(h.deps);
    await settle(engine);

    press(hover(host, 2));
    expect(ownedRows(host)).toBe(1);

    engine.refresh();
    await settle(engine);
    expect(ownedRows(host)).toBe(0);
    engine.dispose();
  });
});

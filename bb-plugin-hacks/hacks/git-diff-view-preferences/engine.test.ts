// @vitest-environment jsdom
//
// The sync loop driven against a DOM shaped like bb's, with a fake bb standing
// in for React: clicking a toolbar control flips its `aria-pressed` and, for
// the wrap button, its label — the way bb's own buttons do. That is enough to
// catch the failures that only show up once the pieces are wired together.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startEngine, type Engine } from "./engine";
import type { ToolbarPrefs } from "./prefs";
import type { PrefsStore } from "./storage";

/**
 * The toolbar plus the bit of bb behavior that responds to a click. The view
 * mode is a radio pair rather than a toggle, so setting one clears the other.
 */
function renderToolbar(
  options: { wrap?: boolean; view?: "unified" | "split" } = {},
): HTMLElement {
  const { wrap = false, view = "unified" } = options;
  const toolbar = document.createElement("div");
  toolbar.setAttribute("data-testid", "git-diff-toolbar-actions");
  toolbar.innerHTML = `
    <button type="button" aria-label="Collapse all files"></button>
    <button
      type="button"
      aria-label="${wrap ? "Disable diff line wrap" : "Wrap diff lines"}"
      aria-pressed="${wrap}"></button>
    <div role="tablist" aria-label="Diff view mode">
      <button type="button" aria-label="Stacked diff view" aria-pressed="${view === "unified"}"></button>
      <button type="button" aria-label="Split diff view" aria-pressed="${view === "split"}"></button>
    </div>`;
  document.body.prepend(toolbar);

  const button = (label: string) =>
    toolbar.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

  const wrapButton = button(wrap ? "Disable diff line wrap" : "Wrap diff lines");
  wrapButton.addEventListener("click", () => {
    const pressed = wrapButton.getAttribute("aria-pressed") === "true";
    wrapButton.setAttribute("aria-pressed", String(!pressed));
    wrapButton.setAttribute(
      "aria-label",
      pressed ? "Wrap diff lines" : "Disable diff line wrap",
    );
  });

  const stacked = button("Stacked diff view");
  const split = button("Split diff view");
  for (const [clicked, other] of [
    [stacked, split],
    [split, stacked],
  ] as const) {
    clicked.addEventListener("click", () => {
      clicked.setAttribute("aria-pressed", "true");
      other.setAttribute("aria-pressed", "false");
    });
  }

  return toolbar;
}

/** How the toolbar currently reads, straight off the DOM. */
function toolbarState(): { wrap: boolean; view: string } {
  const pressed = (label: string) =>
    document
      .querySelector(`button[aria-label="${label}"]`)
      ?.getAttribute("aria-pressed") === "true";
  return {
    wrap: pressed("Disable diff line wrap"),
    view: pressed("Split diff view") ? "split" : "unified",
  };
}

/** Clicking as the user would, which is what bb's own handler sees. */
function click(label: string): void {
  (
    document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement
  ).click();
}

function fakeStore(initial: ToolbarPrefs = {}): PrefsStore & {
  saved: ToolbarPrefs;
  writes: number;
  fire: () => void;
} {
  let listener: (() => void) | null = null;
  const store = {
    saved: { ...initial } as ToolbarPrefs,
    writes: 0,
    read: () => ({ ...store.saved }),
    write: (prefs: ToolbarPrefs) => {
      store.saved = { ...prefs };
      store.writes += 1;
    },
    subscribe: (onChange: () => void) => {
      listener = onChange;
      return () => {
        listener = null;
      };
    },
    /** Stand in for another window's write arriving. */
    fire: () => listener?.(),
  };
  return store;
}

let controller: AbortController;
let started: Engine[] = [];
let compact = false;
let pending: (() => void)[] = [];

/**
 * Drain the deferred passes, the way a run of animation frames would. Passes
 * are queued rather than run inline so the engine's own coalescing is exercised
 * instead of bypassed — running `defer` synchronously leaves its cancel handle
 * assigned after the pass has already finished, which silently swallows every
 * later `schedule()`.
 */
function flush(): void {
  for (let guard = 0; guard < 20 && pending.length > 0; guard += 1) {
    const queued = pending;
    pending = [];
    for (const run of queued) run();
  }
}

function start(store: PrefsStore): Engine {
  const engine = startEngine({
    signal: controller.signal,
    doc: document,
    store,
    isCompactViewport: () => compact,
    defer: (run) => {
      pending.push(run);
      return () => {
        pending = pending.filter((queued) => queued !== run);
      };
    },
  });
  started.push(engine);
  // Settle the pass `startEngine` asks for, as the first frame would.
  flush();
  return engine;
}

beforeEach(() => {
  controller = new AbortController();
  started = [];
  compact = false;
  pending = [];
});

afterEach(() => {
  for (const engine of started) engine.dispose();
  controller.abort();
  document.body.innerHTML = "";
});

describe("restoring a saved preference", () => {
  it("puts the toolbar back the way it was left", () => {
    renderToolbar({ wrap: false, view: "unified" });
    start(fakeStore({ wrap: true, view: "split" }));

    expect(toolbarState()).toEqual({ wrap: true, view: "split" });
  });

  it("restores onto a toolbar that mounts after the engine starts", () => {
    const engine = start(fakeStore({ view: "split" }));
    renderToolbar({ view: "unified" });
    engine.syncNow();

    expect(toolbarState().view).toBe("split");
  });

  it("leaves bb's width-driven default in charge when nothing was chosen", () => {
    renderToolbar({ wrap: true, view: "split" });
    start(fakeStore({}));

    // bb rendered split from the panel width; with no stored choice the hack
    // has no business overriding it.
    expect(toolbarState()).toEqual({ wrap: true, view: "split" });
  });

  it("does not click a control that already reads the saved way", () => {
    const toolbar = renderToolbar({ wrap: true, view: "split" });
    let clicks = 0;
    for (const button of toolbar.querySelectorAll("button")) {
      button.addEventListener("click", () => {
        clicks += 1;
      });
    }
    start(fakeStore({ wrap: true, view: "split" }));

    expect(clicks).toBe(0);
  });

  it("does not save the state it just restored back over itself", () => {
    renderToolbar({ wrap: false, view: "unified" });
    const store = fakeStore({ wrap: true, view: "split" });
    start(store);

    expect(store.writes).toBe(0);
    expect(store.saved).toEqual({ wrap: true, view: "split" });
  });

  it("re-restores when bb remounts the toolbar", () => {
    renderToolbar({ wrap: false, view: "unified" });
    const engine = start(fakeStore({ view: "split" }));
    expect(toolbarState().view).toBe("split");

    // A remount is bb rebuilding the panel: fresh React state, fresh DOM.
    document.body.innerHTML = "";
    renderToolbar({ wrap: false, view: "unified" });
    engine.syncNow();

    expect(toolbarState().view).toBe("split");
  });
});

describe("saving what the user does", () => {
  it("saves a view mode the user picks", () => {
    renderToolbar({ view: "unified" });
    const store = fakeStore({});
    const engine = start(store);

    click("Split diff view");
    engine.syncNow();

    expect(store.saved).toEqual({ view: "split" });
  });

  it("saves the wrap toggle", () => {
    renderToolbar({ wrap: false });
    const store = fakeStore({});
    const engine = start(store);

    click("Wrap diff lines");
    engine.syncNow();

    expect(store.saved.wrap).toBe(true);
  });

  it("saves a choice that returns the toolbar to bb's own default", () => {
    // Choosing stacked on a wide panel is a real preference, not a reset: it
    // has to be stored, or the width-driven default would undo it next time.
    renderToolbar({ view: "split" });
    const store = fakeStore({ view: "split" });
    const engine = start(store);

    click("Stacked diff view");
    engine.syncNow();

    expect(store.saved).toEqual({ view: "unified" });
  });

  it("writes once per change, not once per pass", () => {
    renderToolbar({ view: "unified" });
    const store = fakeStore({});
    const engine = start(store);

    click("Split diff view");
    engine.syncNow();
    engine.syncNow();
    engine.syncNow();

    expect(store.writes).toBe(1);
  });
});

describe("a change bb makes on its own", () => {
  /**
   * bb re-applies its width-driven default whenever the panel crosses 760px,
   * without anyone clicking: `handleSecondaryPanelWidthChange` in
   * useResponsiveGitDiffPanelDisplay.ts clears its explicit-choice ref on a
   * breakpoint crossing and sets the mode from the width.
   */
  function bbSetsViewItself(view: "unified" | "split"): void {
    const set = (label: string, pressed: boolean) => {
      document
        .querySelector(`button[aria-label="${label}"]`)
        ?.setAttribute("aria-pressed", String(pressed));
    };
    set("Stacked diff view", view === "unified");
    set("Split diff view", view === "split");
  }

  it("does not record bb's width-driven override as the user's choice", () => {
    renderToolbar({ view: "unified" });
    const store = fakeStore({ view: "unified" });
    const engine = start(store);

    // The panel crosses 760px and bb forces split. The user chose unified.
    bbSetsViewItself("split");
    engine.syncNow();

    expect(store.saved).toEqual({ view: "unified" });
    expect(store.writes).toBe(0);
  });

  it("puts the toolbar back after bb overrides the stored choice", () => {
    renderToolbar({ view: "unified" });
    const engine = start(fakeStore({ view: "unified" }));

    bbSetsViewItself("split");
    engine.syncNow();

    expect(toolbarState().view).toBe("unified");
  });

  it("keeps correcting across repeated overrides", () => {
    // Each panel resize across 760px is another override to undo.
    renderToolbar({ view: "unified" });
    const store = fakeStore({ view: "unified" });
    const engine = start(store);

    for (let crossing = 0; crossing < 3; crossing += 1) {
      bbSetsViewItself("split");
      engine.syncNow();
      expect(toolbarState().view).toBe("unified");
    }
    expect(store.writes).toBe(0);
  });
});

describe("another window", () => {
  it("applies a preference changed elsewhere", () => {
    renderToolbar({ view: "unified" });
    const store = fakeStore({});
    start(store);

    store.saved = { view: "split" };
    store.fire();
    flush();

    expect(toolbarState().view).toBe("split");
  });
});

describe("a compact viewport", () => {
  it("leaves the drawer exactly as bb rendered it", () => {
    compact = true;
    renderToolbar({ wrap: false, view: "unified" });
    start(fakeStore({ wrap: true, view: "split" }));

    expect(toolbarState()).toEqual({ wrap: false, view: "unified" });
  });

  it("never overwrites the desktop preference from a phone-width window", () => {
    compact = true;
    renderToolbar({ view: "unified" });
    const store = fakeStore({ view: "split" });
    const engine = start(store);

    click("Stacked diff view");
    engine.syncNow();

    expect(store.writes).toBe(0);
    expect(store.saved).toEqual({ view: "split" });
  });
});

describe("scope", () => {
  it("does nothing when the changes panel is not open", () => {
    const store = fakeStore({ view: "split" });
    start(store);

    expect(store.writes).toBe(0);
  });

  it("stops touching the toolbar once disposed", () => {
    renderToolbar({ view: "unified" });
    const store = fakeStore({});
    const engine = start(store);
    engine.dispose();

    click("Split diff view");

    // Disposed means disposed: no observer, so no pass, so no write.
    expect(store.writes).toBe(0);
  });
});

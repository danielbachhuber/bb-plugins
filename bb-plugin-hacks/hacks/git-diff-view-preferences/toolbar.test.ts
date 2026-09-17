// @vitest-environment jsdom
//
// The fixture below mirrors the DOM bb's GitDiffToolbar actually renders. It is
// the contract this hack depends on: if a bb upgrade changes the toolbar, these
// tests are where that shows up, and the fix is to re-read
// app/dist/assets/ThreadSecondaryPanel-*.js and update both the fixture and
// toolbar.ts together.
import { afterEach, describe, expect, it } from "vitest";
import {
  applyClicks,
  findToolbar,
  intentFromClick,
  readToolbar,
} from "./toolbar";

afterEach(() => {
  document.body.innerHTML = "";
});

/** The toolbar as bb renders it above the file cards. */
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
  document.body.append(toolbar);
  return toolbar;
}

describe("readToolbar", () => {
  it("reads both controls from aria-pressed", () => {
    expect(readToolbar(renderToolbar({ wrap: true, view: "split" }))).toEqual({
      wrap: true,
      view: "split",
    });
  });

  it("reads the wrap button under either of its two labels", () => {
    expect(readToolbar(renderToolbar({ wrap: false })).wrap).toBe(false);
    expect(readToolbar(renderToolbar({ wrap: true })).wrap).toBe(true);
  });

  it("reports a control bb did not render as unknown, never as a default", () => {
    const toolbar = document.createElement("div");
    toolbar.setAttribute("data-testid", "git-diff-toolbar-actions");
    document.body.append(toolbar);
    expect(readToolbar(toolbar)).toEqual({ wrap: null, view: null });
  });
});

describe("findToolbar", () => {
  it("finds the toolbar", () => {
    renderToolbar();
    expect(findToolbar(document)).not.toBeNull();
  });

  it("returns null when there is no changes toolbar on the page", () => {
    expect(findToolbar(document)).toBeNull();
  });
});

describe("applyClicks", () => {
  it("clicks the buttons named, and only those", () => {
    const toolbar = renderToolbar({ wrap: false, view: "unified" });
    const clicked: string[] = [];
    for (const button of toolbar.querySelectorAll("button")) {
      button.addEventListener("click", () => {
        clicked.push(button.getAttribute("aria-label") ?? "");
      });
    }

    applyClicks(toolbar, ["wrap", "split"]);
    expect(clicked).toEqual(["Wrap diff lines", "Split diff view"]);
  });

  it("never touches collapse all", () => {
    const toolbar = renderToolbar();
    let collapseAllClicks = 0;
    toolbar
      .querySelector('button[aria-label="Collapse all files"]')
      ?.addEventListener("click", () => {
        collapseAllClicks += 1;
      });

    applyClicks(toolbar, ["wrap", "stacked", "split"]);
    expect(collapseAllClicks).toBe(0);
  });

  it("is a no-op for a control bb did not render", () => {
    const toolbar = document.createElement("div");
    document.body.append(toolbar);
    expect(() => applyClicks(toolbar, ["wrap", "split"])).not.toThrow();
  });
});

describe("intentFromClick", () => {
  const button = (toolbar: HTMLElement, label: string) =>
    toolbar.querySelector(`button[aria-label="${label}"]`) as HTMLElement;

  it("reads a view-mode click as the mode it asks for, not a toggle", () => {
    const toolbar = renderToolbar({ view: "unified" });
    expect(intentFromClick(toolbar, button(toolbar, "Split diff view"))).toEqual({
      view: "split",
    });
    expect(
      intentFromClick(toolbar, button(toolbar, "Stacked diff view")),
    ).toEqual({ view: "unified" });
  });

  it("reads a wrap click as the opposite of what it reads now", () => {
    const off = renderToolbar({ wrap: false });
    expect(intentFromClick(off, button(off, "Wrap diff lines"))).toEqual({
      wrap: true,
    });

    const on = renderToolbar({ wrap: true });
    expect(intentFromClick(on, button(on, "Disable diff line wrap"))).toEqual({
      wrap: false,
    });
  });

  it("resolves a click on an icon inside the button", () => {
    const toolbar = renderToolbar({ view: "unified" });
    const icon = document.createElement("svg");
    button(toolbar, "Split diff view").append(icon);
    expect(intentFromClick(toolbar, icon)).toEqual({ view: "split" });
  });

  it("ignores collapse all, which is an action rather than a setting", () => {
    const toolbar = renderToolbar();
    expect(
      intentFromClick(toolbar, button(toolbar, "Collapse all files")),
    ).toBeNull();
  });

  it("ignores a click outside the toolbar", () => {
    const toolbar = renderToolbar();
    const outside = document.createElement("button");
    document.body.append(outside);
    expect(intentFromClick(toolbar, outside)).toBeNull();
  });
});

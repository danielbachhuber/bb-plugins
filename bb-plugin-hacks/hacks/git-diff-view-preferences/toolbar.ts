// Reading and driving bb's changes-panel toolbar.
//
// bb owns this DOM. Everything here anchors on what bb emits deliberately —
// the toolbar's `data-testid`, the buttons' accessible names, and their
// `aria-pressed` — and never on a minified class name. Read GitDiffToolbar in
// app/dist/assets before changing an assumption here.
import type { ToolbarClick, ToolbarIntent, ToolbarState } from "./prefs";

/**
 * The changes-panel toolbar — the row holding collapse-all, wrap, and the
 * view-mode pair. Its presence is also how this hack knows the changes panel
 * is open at all.
 */
export const TOOLBAR_SELECTOR = '[data-testid="git-diff-toolbar-actions"]';

/**
 * Each control's accessible name. bb flips the wrap button's label with its
 * state, so both readings have to match the same control.
 */
const BUTTON_LABELS: Record<ToolbarClick, readonly string[]> = {
  wrap: ["Wrap diff lines", "Disable diff line wrap"],
  stacked: ["Stacked diff view"],
  split: ["Split diff view"],
};

export function findToolbar(root: ParentNode): HTMLElement | null {
  const toolbar = root.querySelector(TOOLBAR_SELECTOR);
  return toolbar instanceof HTMLElement ? toolbar : null;
}

export function toolbarButton(
  toolbar: HTMLElement,
  click: ToolbarClick,
): HTMLButtonElement | null {
  for (const label of BUTTON_LABELS[click]) {
    const button = toolbar.querySelector(
      `button[aria-label="${CSS.escape(label)}"]`,
    );
    if (button instanceof HTMLButtonElement) return button;
  }
  return null;
}

function isPressed(button: HTMLButtonElement | null): boolean | null {
  const pressed = button?.getAttribute("aria-pressed");
  if (pressed !== "true" && pressed !== "false") return null;
  return pressed === "true";
}

/**
 * Read the toolbar's current settings. Every control reports `aria-pressed`,
 * so nothing here has to infer state from an icon or a class. A control bb did
 * not render reads as null rather than a guess.
 */
export function readToolbar(toolbar: HTMLElement): ToolbarState {
  const stacked = isPressed(toolbarButton(toolbar, "stacked"));
  const split = isPressed(toolbarButton(toolbar, "split"));
  return {
    wrap: isPressed(toolbarButton(toolbar, "wrap")),
    view: stacked === true ? "unified" : split === true ? "split" : null,
  };
}

/**
 * What the user asked for by clicking, or null when the click was not on a
 * control this hack owns. The wrap button is a toggle, so its intent is the
 * opposite of what it reads *now* — this runs before React has re-rendered.
 */
export function intentFromClick(
  toolbar: HTMLElement,
  target: Element,
): ToolbarIntent | null {
  const button = target.closest("button");
  if (button === null || !toolbar.contains(button)) return null;
  if (button === toolbarButton(toolbar, "stacked")) return { view: "unified" };
  if (button === toolbarButton(toolbar, "split")) return { view: "split" };
  if (button === toolbarButton(toolbar, "wrap")) {
    const pressed = isPressed(button);
    return pressed === null ? null : { wrap: !pressed };
  }
  return null;
}

/** Apply the clicks, skipping any control bb did not render. */
export function applyClicks(
  toolbar: HTMLElement,
  clicks: readonly ToolbarClick[],
): void {
  for (const click of clicks) toolbarButton(toolbar, click)?.click();
}

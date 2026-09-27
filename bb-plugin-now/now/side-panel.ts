// Hiding bb's side panel from inside one of its tabs. The plugin SDK can open a
// fixed tab but not hide the panel, so this presses bb's own hide button.

/** What `hideSidePanel` needs of a DOM element, so it can be tested without one. */
export interface PanelNode {
  readonly parentElement: PanelNode | null;
  querySelector(selectors: string): { click(): void } | null;
}

// bb labels the button "Hide right panel", with its shortcut appended when one is set.
const HIDE_BUTTON = 'button[aria-label^="Hide right panel"]';

/**
 * Press the hide button of the panel that holds `from`: the nearest one going
 * outward, so a second panel elsewhere on the screen stays open. Returns
 * whether it found one.
 */
export function hideSidePanel(from: PanelNode | null): boolean {
  for (let node = from; node !== null; node = node.parentElement) {
    const button = node.querySelector(HIDE_BUTTON);
    if (button !== null) {
      button.click();
      return true;
    }
  }
  return false;
}

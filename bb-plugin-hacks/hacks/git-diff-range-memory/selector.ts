// Reading and driving bb's range dropdown ("All changes", "Uncommitted
// changes", …) at the top of the changes panel.
//
// Unlike the other hacks, this one reads React's props off the DOM rather than
// clicking bb's controls. Selecting a range by clicking would mean opening the
// menu on every thread switch, which flashes it and takes focus from the
// composer, and the menu cannot tell the hack which ranges exist until it is
// open. The props carry both the ranges and bb's own `onChange`.
import type { RangeOption } from "./rules";

export const SELECTOR_SLOT_SELECTOR =
  '[data-testid="git-diff-toolbar-selector-slot"]';

/**
 * How far up from the trigger button to look for `GitDiffSelector`. Radix's
 * trigger, popper, and menu providers sit between them: 23 fibers in bb 0.44.
 * The margin is for wrappers a later bb adds.
 */
const MAX_FIBER_DEPTH = 40;

/** The props bb passes `GitDiffSelector`. */
export interface SelectorProps {
  value: string;
  options: readonly RangeOption[];
  onChange: (value: string) => void;
}

/** The dropdown's trigger button, when the changes panel is showing. */
export function findTrigger(doc: Document): HTMLElement | null {
  const trigger = doc.querySelector(`${SELECTOR_SLOT_SELECTOR} button`);
  return trigger instanceof HTMLElement ? trigger : null;
}

interface Fiber {
  memoizedProps?: unknown;
  return?: Fiber | null;
}

function isSelectorProps(props: unknown): props is SelectorProps {
  if (props === null || typeof props !== "object") return false;
  const candidate = props as Record<string, unknown>;
  return (
    typeof candidate.value === "string" &&
    typeof candidate.onChange === "function" &&
    Array.isArray(candidate.options) &&
    candidate.options.every(
      (option: unknown) =>
        option !== null &&
        typeof option === "object" &&
        typeof (option as RangeOption).value === "string" &&
        typeof (option as RangeOption).label === "string",
    )
  );
}

/**
 * `GitDiffSelector`'s current props, found by walking up from the trigger's
 * React fiber. React keeps the fiber on the DOM node under a
 * `__reactFiber$<random>` key. If a bb upgrade changes the shape, this finds
 * nothing and the hack does nothing.
 */
export function readSelectorProps(trigger: Element): SelectorProps | null {
  const key = Object.keys(trigger).find((name) =>
    name.startsWith("__reactFiber$"),
  );
  if (key === undefined) return null;
  let fiber = (trigger as unknown as Record<string, Fiber | undefined>)[key];
  for (let depth = 0; fiber && depth < MAX_FIBER_DEPTH; depth += 1) {
    if (isSelectorProps(fiber.memoizedProps)) return fiber.memoizedProps;
    fiber = fiber.return ?? undefined;
  }
  return null;
}

/**
 * The menu item a click landed on, if it is in the open range menu. The menu
 * is portaled out of the toolbar, so it is found through the trigger: Radix
 * points the trigger's `aria-controls` at the menu's id while it is open.
 */
export function clickedMenuItem(
  doc: Document,
  trigger: Element,
  target: Element,
): HTMLElement | null {
  if (trigger.getAttribute("aria-expanded") !== "true") return null;
  const menuId = trigger.getAttribute("aria-controls");
  if (menuId === null || menuId === "") return null;
  const menu = doc.getElementById(menuId);
  if (menu === null) return null;
  const item = target.closest('[role="menuitem"]');
  return item instanceof HTMLElement && menu.contains(item) ? item : null;
}

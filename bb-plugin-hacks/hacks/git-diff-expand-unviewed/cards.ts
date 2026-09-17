// Reading bb's diff card headers.
//
// This is a trimmed copy of the same parsing in bb-plugin-diff-viewed. The two
// plugins ship separately, so a shared package would have to be published and
// versioned for the benefit of two callers; the copy is the cheaper trade until
// a third one needs it. Only what this hack reads is kept — it decorates
// nothing, so none of diff-viewed's injection or cleanup came along.
//
// bb owns this DOM. Everything anchors on what bb emits deliberately — the
// collapse button's accessible name and `aria-expanded`, and the header's
// two-child structure — and never on a minified class name. Read
// GitDiffCardHeader in app/dist/assets before changing an assumption here.

/** The attribute bb-plugin-diff-viewed sets on a viewed file's header row. */
export const VIEWED_ATTR = "data-diff-viewed";
/** The attribute marking diff-viewed's own injected nodes. */
const VIEWED_OWNED_ATTR = "data-diff-viewed-owned";
/** Timeline diffs, which are deliberately out of scope. */
const TIMELINE_SELECTOR = "[data-timeline-file-diff]";

export interface DiffCard {
  path: string;
  /** The header's `+N -M` text, which stands in for the file's contents. */
  stats: string;
  toggle: HTMLButtonElement;
  isCollapsed: boolean;
  /** Whether diff-viewed has marked this file read. */
  isViewed: boolean;
}

function pathFromToggleLabel(label: string | null): string | null {
  if (label === null) return null;
  const match = /^(?:Collapse|Expand) (.+)$/.exec(label);
  return match?.[1] ?? null;
}

/**
 * Resolve a collapse control to the card it belongs to, or null when the
 * element is not a diff card header after all. The structural checks are what
 * keep a stray `aria-expanded` disclosure elsewhere in the app from matching.
 */
export function resolveCard(toggle: Element): DiffCard | null {
  if (!(toggle instanceof HTMLButtonElement)) return null;
  const expanded = toggle.getAttribute("aria-expanded");
  if (expanded !== "true" && expanded !== "false") return null;
  if (toggle.closest(TIMELINE_SELECTOR) !== null) return null;

  const left = toggle.parentElement;
  if (left === null || left.firstElementChild !== toggle) return null;
  const headerRow = left.parentElement;
  if (headerRow === null || headerRow.childElementCount !== 2) return null;
  if (!headerRow.classList.contains("justify-between")) return null;
  const actions = headerRow.lastElementChild;
  if (!(actions instanceof HTMLElement) || actions === left) return null;

  const path = pathFromToggleLabel(toggle.getAttribute("aria-label"));
  if (path === null) return null;

  return {
    path,
    stats: readStats(actions),
    toggle,
    isCollapsed: expanded === "false",
    isViewed: headerRow.getAttribute(VIEWED_ATTR) === "true",
  };
}

/**
 * The card's `+N -M` text, with diff-viewed's own nodes excluded so its
 * checkbox label cannot end up inside the reading.
 */
function readStats(actions: HTMLElement): string {
  return Array.from(actions.children)
    .filter((child) => !child.hasAttribute(VIEWED_OWNED_ATTR))
    .map((child) => child.textContent ?? "")
    .join(" ")
    .trim();
}

/** Every diff card currently rendered, in document order. */
export function findCards(root: ParentNode): DiffCard[] {
  const cards: DiffCard[] = [];
  for (const toggle of root.querySelectorAll("button[aria-expanded]")) {
    const card = resolveCard(toggle);
    if (card !== null) cards.push(card);
  }
  return cards;
}

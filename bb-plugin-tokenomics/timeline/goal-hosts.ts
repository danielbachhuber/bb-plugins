// Places empty elements in bb's own markup for the goal band at the top of a
// thread's conversation and the goal mark beside each sidebar row's title to
// render into.
//
// bb gives plugins no slot between the thread header and the conversation, or
// inside a sidebar row, so this reads bb's markup: the thread's pane is a
// column holding its `<header>` and then `[data-thread-window]`, which scrolls
// the conversation inside itself, and each sidebar row has an
// `a[data-sidebar-thread-id]` beside the span holding its `.bb-thread-title`. That markup is not an API.
// When bb changes it, the lines stop appearing and nothing else breaks, and
// the tests here, which build the same markup, say what they expected.

/**
 * The plugin's stylesheet applies only under an element carrying this, so
 * each host carries it; without it, classes bb's own stylesheet lacks, such
 * as the donut's stroke colours, do nothing.
 */
export const STYLE_SCOPE: [string, string] = ["data-bb-plugin", "tokenomics"];

/** Marks the goal band at the top of a thread's conversation. */
export const TITLE_HOST_ATTRIBUTE = "data-tokenomics-goal";
/** Marks the element beside a sidebar row's title, and names the row's thread. */
export const ROW_HOST_ATTRIBUTE = "data-tokenomics-goal-row";

/**
 * The thread header holding `anchor`, a node rendered in the header's action
 * row, when bb's conversation follows it. Null when bb's markup has moved.
 */
export function threadHeaderOf(anchor: Element): Element | null {
  const header = anchor.closest("header");
  if (header === null) return null;
  // A band already placed sits between them.
  let next = header.nextElementSibling;
  while (next !== null && next.hasAttribute(TITLE_HOST_ATTRIBUTE)) next = next.nextElementSibling;
  return next?.hasAttribute("data-thread-window") ? header : null;
}

/**
 * Puts `host` right after the thread header, above the conversation, once.
 * The conversation scrolls inside its own element, so the band stays in view.
 * Returns whether it is in place.
 */
export function placeBandHost(anchor: Element, host: HTMLElement): boolean {
  const header = threadHeaderOf(anchor);
  if (header === null) {
    host.remove();
    return false;
  }
  if (header.nextElementSibling !== host) header.after(host);
  return true;
}

/**
 * How much further left the donut pushes bb's hover buttons: the donut, its
 * margin, and the trailing area's gap. bb trims the title on hover by the
 * buttons' width alone, so a row with a donut trims this much more, or the
 * buttons cover the end of the title.
 */
export const DONUT_WIDTH_PX = 24;

/** Marks bb's icon box in a row whose donut has taken its place. The stylesheet SIDEBAR_SLOT_CSS collapses it. */
export const SLOT_ATTRIBUTE = "data-tokenomics-goal-slot";

/**
 * Collapses bb's icon box in a row with a donut, and hides bb's icon, which
 * stays in the page so its label can still be read. bb's hover buttons are
 * anchored to the box's right edge, so they then appear just left of the
 * donut, and the title gives up DONUT_WIDTH_PX more on hover to make room.
 * A row with child threads keeps that room at all times, as bb does for it,
 * so its collapse chevron stays clear of the buttons.
 */
export const SIDEBAR_SLOT_CSS = `[${SLOT_ATTRIBUTE}] { width: 0 !important; }
[${SLOT_ATTRIBUTE}] > .bb-sidebar-hover-actions-fade { display: none !important; }
.bb-sidebar-hover-actions-row:has([${ROW_HOST_ATTRIBUTE}]):is(:hover, :focus-within, :has([data-sidebar-hover-actions-open])) .bb-sidebar-hover-actions-inset,
.bb-sidebar-hover-actions-row:has([${ROW_HOST_ATTRIBUTE}]) > span:has(> a[data-sidebar-thread-id]):not(.bb-sidebar-hover-actions-inset) { padding-right: calc(var(--bb-sidebar-hover-actions-inset, 0px) + ${DONUT_WIDTH_PX}px) !important; }`;

export interface RowPlacement {
  hosts: Map<string, HTMLElement>;
  /** The label of bb's icon in each placed row, or null when it shows none. */
  labels: Map<string, string | null>;
}

/** The row element holding the link, and its trailing area. */
function trailingOf(link: Element): Element | null {
  let row: Element | null = link;
  for (let depth = 0; depth < 5 && row !== null; depth += 1) {
    const trailing = row.querySelector("[data-sidebar-thread-trailing]");
    if (trailing !== null) return trailing;
    row = row.parentElement;
  }
  return null;
}

/**
 * One pass over the sidebar: each thread in `threadIds` whose row is mounted
 * gets a host at the right end of its row, after bb's icon box, which is
 * collapsed. Hosts for anything else are removed and their boxes restored.
 * `hosts` carries them from the last pass, so a row keeps its element when bb
 * re-renders it.
 */
export function placeRowHosts(
  doc: Document,
  threadIds: ReadonlySet<string>,
  hosts: ReadonlyMap<string, HTMLElement>,
): RowPlacement {
  const placed = new Map<string, HTMLElement>();
  const labels = new Map<string, string | null>();
  for (const link of doc.querySelectorAll("a[data-sidebar-thread-id]")) {
    const threadId = link.getAttribute("data-sidebar-thread-id") ?? "";
    if (!threadIds.has(threadId) || placed.has(threadId)) continue;
    const box = trailingOf(link)?.querySelector(".bb-sidebar-hover-actions")?.parentElement;
    if (box == null) continue;
    let host = hosts.get(threadId);
    if (host === undefined) {
      host = doc.createElement("span");
      host.setAttribute(ROW_HOST_ATTRIBUTE, threadId);
      host.setAttribute(...STYLE_SCOPE);
      host.className = "flex shrink-0 items-center";
    }
    if (box.nextElementSibling !== host) box.after(host);
    if (!box.hasAttribute(SLOT_ATTRIBUTE)) box.setAttribute(SLOT_ATTRIBUTE, "");
    const icon = box.querySelector("[data-sidebar-thread-trailing-indicator] [aria-label]");
    labels.set(threadId, icon?.getAttribute("aria-label") ?? null);
    placed.set(threadId, host);
  }
  const kept = new Set(placed.values());
  for (const host of hosts.values()) {
    if (kept.has(host)) continue;
    host.previousElementSibling?.removeAttribute(SLOT_ATTRIBUTE);
    host.remove();
  }
  return { hosts: placed, labels };
}

/** True when every change in `records` is to a host this module placed, so a pass would change nothing. */
export function onlyGoalHostChanges(records: readonly MutationRecord[]): boolean {
  const ours = (node: Node) =>
    node instanceof Element && (node.hasAttribute(ROW_HOST_ATTRIBUTE) || node.hasAttribute(TITLE_HOST_ATTRIBUTE) || node.closest(`[${ROW_HOST_ATTRIBUTE}], [${TITLE_HOST_ATTRIBUTE}]`) !== null);
  return records.every(
    (record) =>
      ours(record.target) || [...record.addedNodes, ...record.removedNodes].every((node) => ours(node)),
  );
}

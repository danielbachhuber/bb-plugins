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
 * One pass over the sidebar: each thread in `threadIds` whose row is mounted
 * gets a host before its title, and hosts for anything else are removed.
 * Returns the hosts by thread. `hosts` carries them from the last pass, so a
 * row keeps its element when bb re-renders it.
 */
export function placeRowHosts(
  doc: Document,
  threadIds: ReadonlySet<string>,
  hosts: ReadonlyMap<string, HTMLElement>,
): Map<string, HTMLElement> {
  const placed = new Map<string, HTMLElement>();
  for (const link of doc.querySelectorAll("a[data-sidebar-thread-id]")) {
    const threadId = link.getAttribute("data-sidebar-thread-id") ?? "";
    if (!threadIds.has(threadId) || placed.has(threadId)) continue;
    const title = link.parentElement?.querySelector(".bb-thread-title");
    const container = title?.parentElement;
    if (title == null || container == null) continue;
    let host = hosts.get(threadId);
    if (host === undefined) {
      host = doc.createElement("span");
      host.setAttribute(ROW_HOST_ATTRIBUTE, threadId);
      host.setAttribute(...STYLE_SCOPE);
      host.style.display = "contents";
    }
    // Before the title: bb's hover actions cover the end of the row.
    if (title.previousElementSibling !== host) title.before(host);
    placed.set(threadId, host);
  }
  const kept = new Set(placed.values());
  for (const host of hosts.values()) {
    if (!kept.has(host)) host.remove();
  }
  return placed;
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

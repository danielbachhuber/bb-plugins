// Places empty elements in bb's own markup for the goal line under a thread's
// title and the goal mark beside each sidebar row's title to render into.
//
// bb gives plugins no slot under the title or inside a sidebar row, so this
// reads bb's markup: the header is a `<header>` holding the title's
// `.bb-thread-title`, and each sidebar row has an `a[data-sidebar-thread-id]`
// beside the span holding its `.bb-thread-title`. That markup is not an API.
// When bb changes it, the lines stop appearing and nothing else breaks, and
// the tests here, which build the same markup, say what they expected.

/** Marks the element under a header's title. */
export const TITLE_HOST_ATTRIBUTE = "data-tokenomics-goal";
/** Marks the element beside a sidebar row's title, and names the row's thread. */
export const ROW_HOST_ATTRIBUTE = "data-tokenomics-goal-row";

/**
 * The header holding `anchor`, a node rendered in the header's action row,
 * and the block holding its title. Null when bb's markup has moved.
 */
export function titleBlockOf(anchor: Element): Element | null {
  const header = anchor.closest("header");
  const title = header?.querySelector(".bb-thread-title");
  // The title sits in a <p> inside a block; the line goes after the <p>, in the block.
  const paragraph = title?.closest("p");
  return paragraph?.parentElement ?? null;
}

/**
 * Puts `host` as the last child of the header's title block, once. Returns
 * whether it is in place.
 */
export function placeTitleHost(anchor: Element, host: HTMLElement): boolean {
  const block = titleBlockOf(anchor);
  if (block === null) {
    host.remove();
    return false;
  }
  if (block.lastElementChild !== host) block.appendChild(host);
  return true;
}

/**
 * One pass over the sidebar: each thread in `threadIds` whose row is mounted
 * gets a host after its title, and hosts for anything else are removed.
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
      host.style.display = "contents";
    }
    if (title.nextElementSibling !== host) title.after(host);
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

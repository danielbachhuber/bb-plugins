// Places an empty element at the end of each turn's last row in bb's
// conversation, for the turn's summary line to render into.
//
// bb gives plugins no slot under a turn, so this reads bb's own markup: each
// row is a `[data-timeline-row-id]` element, and its id names the turn. That
// markup is not an API, so when bb changes it the lines stop appearing and
// nothing else breaks. bb mounts only the rows near the scroll position, and
// re-renders rows as a turn streams, so every pass puts back what moved.

import { lastRowByTurn } from "../usage/turn-summary.js";

/** Marks the elements this places, and names the turn each is for. */
export const HOST_ATTRIBUTE = "data-tokenomics-turn";
/** Names the thread a host belongs to, since two threads can be open side by side. */
const THREAD_ATTRIBUTE = "data-tokenomics-thread";

const ROW_SELECTOR = "[data-timeline-row-id]";

/**
 * One pass: each turn in `turnIds` gets a host as the last child of its last
 * row in this thread's conversation, and hosts for anything else are removed.
 * Returns the hosts by turn. `hosts` carries them from the last pass, so a
 * turn keeps its element, and what was rendered into it, when its row moves.
 */
export function placeTurnHosts(
  doc: Document,
  threadId: string,
  turnIds: ReadonlySet<string>,
  hosts: ReadonlyMap<string, HTMLElement>,
): Map<string, HTMLElement> {
  const rows = new Map<string, Element>();
  for (const row of doc.querySelectorAll(ROW_SELECTOR)) {
    const id = row.getAttribute("data-timeline-row-id") ?? "";
    if (id.startsWith(`${threadId}:`)) rows.set(id, row);
  }
  const placed = new Map<string, HTMLElement>();
  for (const [turnId, rowId] of lastRowByTurn([...rows.keys()])) {
    if (!turnIds.has(turnId)) continue;
    const row = rows.get(rowId)!;
    let host = hosts.get(turnId);
    if (host === undefined) {
      host = doc.createElement("div");
      host.setAttribute(HOST_ATTRIBUTE, turnId);
      host.setAttribute(THREAD_ATTRIBUTE, threadId);
    }
    if (row.lastElementChild !== host) row.appendChild(host);
    placed.set(turnId, host);
  }
  // Hosts for turns no longer shown, or whose row bb unmounted.
  const kept = new Set(placed.values());
  for (const host of hosts.values()) {
    if (!kept.has(host)) host.remove();
  }
  return placed;
}

/** Removes every host for the thread, such as when its lines are turned off. */
export function removeTurnHosts(doc: Document, threadId: string): void {
  for (const host of doc.querySelectorAll(`[${THREAD_ATTRIBUTE}="${threadId}"]`)) host.remove();
}

/**
 * Whether a batch of changes was only this placing its hosts and rendering
 * into them, which needs no new pass.
 */
export function onlyHostChanges(records: readonly MutationRecord[]): boolean {
  const isHost = (node: Node) => node instanceof Element && node.hasAttribute(HOST_ATTRIBUTE);
  const inHost = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(`[${HOST_ATTRIBUTE}]`) != null;
  return records.every(
    (record) => inHost(record.target) || [...record.addedNodes, ...record.removedNodes].every(isHost),
  );
}

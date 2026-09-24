// Where the band goes in bb's page. bb has no slot under the thread header, so
// the header action (which bb does draw, inside one thread's header) finds the
// `<header>` around itself and inserts a container directly after it. bb lays
// the header and the transcript out as a vertical flex column, so the
// container takes its own height and the transcript starts below it.
//
// This is the one place that depends on bb's page structure. When it cannot
// find a header, the caller draws the fallback in the header row instead.

declare const __BB_PLUGIN_ID__: string | undefined;

/** Marks the container, so a stale one is recognizable in the inspector. */
export const BAND_ATTRIBUTE = "data-thread-overview-band";

export function findHeader(from: Element | null): HTMLElement | null {
  return from?.closest("header") ?? null;
}

/**
 * Insert an empty container after `header` and return it with its cleanup.
 *
 * It carries the plugin's scope attributes, because the plugin's compiled
 * stylesheet only reaches elements inside a `[data-bb-plugin]` root, and this
 * one lives outside the plugin's own mount.
 */
export function insertBandContainer(
  header: HTMLElement,
  pluginId: string | undefined = typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : undefined,
): { container: HTMLElement; remove: () => void } {
  const container = header.ownerDocument.createElement("div");
  container.setAttribute(BAND_ATTRIBUTE, "");
  container.setAttribute("data-bb-plugin-root", "");
  if (pluginId !== undefined) container.setAttribute("data-bb-plugin", pluginId);
  container.style.flexShrink = "0";
  header.after(container);
  return { container, remove: () => container.remove() };
}

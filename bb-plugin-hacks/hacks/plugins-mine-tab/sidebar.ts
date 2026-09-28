// Reading bb's Plugins sidebar and building the My plugins row from one of
// its own rows, so the new row picks up bb's sizing and hover without naming
// a class itself.
export const ROW_ATTR = "data-hacks-plugins-mine";
export const SHELF_PATH = "/plugins/plugin-shelf/mine";

const INSTALLED_HREF = "/plugins?view=installed";
const BROWSE_HREF = "/plugins";

export interface PluginsSidebar {
  /** The Installed plugins row, which the new row goes after. */
  installed: HTMLAnchorElement;
  /** A row that is not the current page, to copy the idle styling from. */
  idle: HTMLAnchorElement;
}

/**
 * The Installed plugins row, but only beside a Browse plugins row: that pair
 * is what makes it bb's Plugins sidebar rather than any other link to the
 * same page.
 */
export function findPluginsSidebar(doc: Document): PluginsSidebar | null {
  for (const installed of doc.querySelectorAll<HTMLAnchorElement>(
    `a[href="${INSTALLED_HREF}"]`,
  )) {
    const parent = installed.parentElement;
    const browse = parent?.querySelector<HTMLAnchorElement>(`:scope > a[href="${BROWSE_HREF}"]`);
    if (!parent || !browse) continue;
    const idle = installed.hasAttribute("aria-current") ? browse : installed;
    if (idle.hasAttribute("aria-current")) continue;
    return { installed, idle };
  }
  return null;
}

export function buildRow(
  idle: HTMLAnchorElement,
  onClick: (event: MouseEvent) => void,
): HTMLAnchorElement {
  const row = idle.cloneNode(true) as HTMLAnchorElement;
  row.setAttribute(ROW_ATTR, "");
  row.setAttribute("href", SHELF_PATH);
  row.removeAttribute("data-discover");
  const label = row.querySelector("span.truncate") ?? row;
  label.textContent = "My plugins";
  row.addEventListener("click", onClick);
  return row;
}

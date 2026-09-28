// Reading and marking up bb's Plugins screen: its sidebar, where the My
// plugins row goes, and its main panel, where the page is drawn. Anchors are
// the sidebar links' targets and the panel's id, never minified class names.
export const MINE_HREF = "/plugins?view=mine";
export const ROW_ATTR = "data-plugin-shelf-row";
export const ROOT_ATTR = "data-plugin-shelf-root";
export const ACTIVE_ATTR = "data-plugin-shelf-active";
const STYLE_ATTR = "data-plugin-shelf-style";

const INSTALLED_HREF = "/plugins?view=installed";
const BROWSE_HREF = "/plugins";
const PANEL_ID = "extensions-main-panel";
/** The class bb adds to a sidebar row for the current page. */
export const ACTIVE_ROW_CLASS = "bg-sidebar-accent";

export function isMineView(location: { pathname: string; search: string }): boolean {
  return (
    location.pathname === BROWSE_HREF &&
    new URLSearchParams(location.search).get("view") === "mine"
  );
}

export interface PluginsSidebar {
  /** The Installed plugins row, which the new row goes after. */
  installed: HTMLAnchorElement;
  browse: HTMLAnchorElement;
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
    const browse = installed.parentElement?.querySelector<HTMLAnchorElement>(
      `:scope > a[href="${BROWSE_HREF}"]`,
    );
    if (!browse) continue;
    const idle = installed.hasAttribute("aria-current") ? browse : installed;
    if (idle.hasAttribute("aria-current")) continue;
    return { installed, browse, idle };
  }
  return null;
}

export function buildRow(
  idle: HTMLAnchorElement,
  onClick: (event: MouseEvent) => void,
): HTMLAnchorElement {
  const row = idle.cloneNode(true) as HTMLAnchorElement;
  row.setAttribute(ROW_ATTR, "");
  row.setAttribute("href", MINE_HREF);
  row.removeAttribute("data-discover");
  const label = row.querySelector("span.truncate") ?? row;
  label.textContent = "My plugins";
  row.addEventListener("click", onClick);
  return row;
}

export function findPanel(doc: Document): HTMLElement | null {
  return doc.getElementById(PANEL_ID);
}

/**
 * bb keeps rendering Browse into the panel while the page is shown there, and
 * may replace those nodes at any time, so they are hidden by a rule rather
 * than one by one.
 */
export function ensureStyle(doc: Document): void {
  if (doc.querySelector(`style[${STYLE_ATTR}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTR, "");
  style.textContent =
    `[${ACTIVE_ATTR}] > :not([${ROOT_ATTR}]) { display: none !important; }\n` +
    `[${ROOT_ATTR}] { height: 100%; min-height: 0; display: flex; flex-direction: column; }`;
  doc.head.append(style);
}

export function removeStyle(doc: Document): void {
  doc.querySelector(`style[${STYLE_ATTR}]`)?.remove();
}

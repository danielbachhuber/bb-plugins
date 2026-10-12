import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { SidebarCount } from "../sidebar-count/sidebar-count";

/**
 * bb's right-panel toggle, which most pages draw at the right end of their top
 * bar. bb has no plugin slot there, so `TopBarSlot` finds the toggle by its
 * label and puts its children just before it. The label is the only thing
 * the toggle keeps on every page; when bb changes it, the slot falls back to
 * the header's actions, and failing those draws nothing.
 */
export const RIGHT_PANEL_TOGGLE = 'button[aria-label^="Show right panel"], button[aria-label^="Hide right panel"]';

/** The row of buttons at the right of a page's header, for a page with no right panel, such as a plugin's. */
export const HEADER_ACTIONS = "[data-app-page-header-actions]";

/** Every plugin's slot element, so slots can line up beside each other. */
const SLOT = "[data-top-bar-slot]";

/**
 * Where the slots go: before the last right-panel toggle, which is the
 * rightmost pane's when a thread is split, or else before the first of the
 * last header's own buttons. `before` is null when the slots go last in
 * `parent`.
 */
export function findTopBarAnchor(root: ParentNode): { parent: HTMLElement; before: Element | null } | null {
  const toggles = root.querySelectorAll<HTMLElement>(RIGHT_PANEL_TOGGLE);
  const toggle = toggles[toggles.length - 1];
  if (toggle?.parentElement) return { parent: toggle.parentElement, before: toggle };
  const rows = root.querySelectorAll<HTMLElement>(HEADER_ACTIONS);
  const row = rows[rows.length - 1];
  return row ? { parent: row, before: Array.from(row.children).find((child) => !child.matches(SLOT)) ?? null } : null;
}

function slotOrder(node: Element): [number, string] {
  const { topBarOrder = "0", topBarSlot = "" } = (node as HTMLElement).dataset;
  return [Number(topBarOrder), topBarSlot];
}

/**
 * The sibling `el` belongs just before: the first slot in the run already
 * beside the anchor that sorts after it, by `order` and then plugin id, or
 * else the anchor. Every slot works this out the same way, so several
 * plugins' slots settle into one order rather than moving past each other.
 */
export function slotNextSibling(parent: Element, before: Element | null, el: Element): Element | null {
  const run: Element[] = [];
  for (let node = before ? before.previousElementSibling : parent.lastElementChild; node?.matches(SLOT); node = node.previousElementSibling) {
    if (node !== el) run.unshift(node);
  }
  const [order, id] = slotOrder(el);
  return run.find((other) => {
    const [otherOrder, otherId] = slotOrder(other);
    return order < otherOrder || (order === otherOrder && id < otherId);
  }) ?? before;
}

/** Whether `pathname` is one of `prefixes` or a page under one. */
export function onPath(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Whether the open page is one the slot's button opens, so the button can show as current. */
const ActiveContext = createContext(false);

/**
 * Puts `children` in bb's top bar, just left of the right-panel toggle, or
 * before the header's own buttons on a page without one, beside any other
 * plugin's slot in `order`. Mount it from an
 * `experimental_appOverlay` component. It follows bb from page to page by
 * watching the document, and draws nothing on a page with neither. Under a
 * path in `activeOn`, the `TopBarCount` inside shows as the current page.
 */
export function TopBarSlot({ pluginId, order = 0, activeOn = [], children }: {
  /**
   * The plugin's id. bb scopes a plugin's stylesheet to elements under
   * `data-bb-plugin="<id>"`, and the slot sits in bb's own header, outside the
   * plugin's root, so it carries the attribute itself.
   */
  pluginId: string;
  /** Where this slot sits among other plugins' slots, lowest leftmost; plugin id breaks a tie. */
  order?: number;
  /** Path prefixes of the page the button opens, such as `/plugins/now/now`. */
  activeOn?: readonly string[];
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = document.createElement("span");
    el.dataset.bbPlugin = pluginId;
    el.dataset.topBarSlot = pluginId;
    el.dataset.topBarOrder = String(order);
    // The top bar is a window-drag region in bb's desktop app; this keeps the chip clickable.
    el.style.setProperty("-webkit-app-region", "no-drag");
    el.style.setProperty("app-region", "no-drag");
    el.style.display = "inline-flex";
    el.style.alignItems = "center";
    el.style.verticalAlign = "top";

    let frame = 0;
    const place = () => {
      frame = 0;
      setActive(onPath(window.location.pathname, activeOn));
      const anchor = findTopBarAnchor(document);
      if (anchor === null) {
        el.remove();
        setHost(null);
        return;
      }
      const { parent, before } = anchor;
      const next = slotNextSibling(parent, before, el);
      if (el.parentElement !== parent || el.nextElementSibling !== next) {
        parent.insertBefore(el, next);
        // Keep a gap before the toggle: a flex row's own gap does it, but the lone toggle on the new-thread page has none.
        const style = getComputedStyle(parent);
        const gap = style.display.includes("flex") ? parseFloat(style.columnGap) || 0 : 0;
        el.style.marginRight = `${Math.max(0, 6 - gap)}px`;
      }
      setHost(el);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(place);
    };

    place();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
      el.remove();
    };
  }, [pluginId, order, activeOn.join("\n")]);

  return host === null ? null : createPortal(<ActiveContext.Provider value={active}>{children}</ActiveContext.Provider>, host);
}

const CHIP =
  "inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-transparent pl-2 pr-1 text-muted-foreground transition-colors duration-150 hover:bg-state-hover hover:text-foreground hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[current=page]:bg-state-active aria-[current=page]:text-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * A page's counts in bb's top bar, as a button that opens the page: its
 * icon, then the same counts `SidebarCount` draws beside its name in the
 * sidebar. At a total of zero only the icon shows. On the page it opens it
 * shows as current, the way bb marks the open page in its own navigation.
 */
export function TopBarCount({
  icon,
  label,
  onClick,
  active,
  ...counts
}: {
  icon: ReactNode;
  /** The button's name, such as "Open Now". */
  label: string;
  onClick: () => void;
  /** Whether its page is open. Inside a `TopBarSlot`, the slot works this out from `activeOn`. */
  active?: boolean;
  urgent: number;
  total: number;
  urgentLabel: string;
  totalLabel: string;
  soon?: number;
  soonLabel?: string;
}) {
  const current = useContext(ActiveContext);
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ?? current ? "page" : undefined}
      title={label}
      className={`${CHIP} ${counts.total === 0 ? "pr-2" : ""}`}
      onClick={onClick}
    >
      {icon}
      <SidebarCount {...counts} />
    </button>
  );
}

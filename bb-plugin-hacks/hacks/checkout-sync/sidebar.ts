// Drawing the indicator into bb's sidebar project headers.
//
// It sits in the header's trailing controls (`data-sidebar-trailing-controls`
// in bb's `TopLevelSidebarSection.tsx`), before the hover actions rather than
// inside them. The sync icon shows only while the row is hovered, like the
// buttons beside it, using bb's own hover-actions class. A checkout that is
// out of date, or whose last pull failed, also carries an amber dot at the
// icon's corner.
import type { CheckoutStatus, Indicator } from "./rules";

/** Marks the indicator this hack adds, so a pass can find and remove its own. */
export const INDICATOR_ATTR = "data-bb-hacks-checkout-sync";

/** bb's class for controls revealed when the row is hovered. */
const HOVER_ONLY_CLASS = "bb-sidebar-hover-actions";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Lucide icons, drawn the way bb draws its own sidebar icons. */
const ICONS = {
  triangle: [
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    "M12 9v4",
    "M12 17h.01",
  ],
  sync: [
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    "M8 16H3v5",
  ],
} as const;

type IconName = keyof typeof ICONS;

/**
 * Where the indicator goes in a header: before the hover actions that hold
 * bb's New thread button, or before the New thread button's own controls when
 * bb lays the header out some other way.
 */
export function anchorFor(newThread: HTMLButtonElement): Element | null {
  const controls = newThread.closest("[data-sidebar-row-controls]");
  if (!controls) return null;
  const trailing = controls.closest("[data-sidebar-trailing-controls]");
  if (!trailing) return controls;
  let anchor: Element = controls;
  while (anchor.parentElement && anchor.parentElement !== trailing) {
    anchor = anchor.parentElement;
  }
  return anchor;
}

/** An empty indicator, styled like bb's New thread button beside it. */
export function createIndicator(
  doc: Document,
  newThread: HTMLButtonElement,
  onClick: () => void,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.setAttribute(INDICATOR_ATTR, "");
  button.className = newThread.className;
  // The dot is placed against the button's corner.
  button.style.position = "relative";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 0) button.blur();
    onClick();
  });
  return button;
}

function icon(doc: Document, name: IconName, iconClass: string | null, spin: boolean): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  const classes = [iconClass ?? "size-4", spin ? "animate-spin" : ""].filter(Boolean).join(" ");
  svg.setAttribute("class", classes);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name]) {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

export interface Drawn {
  project: string;
  status: CheckoutStatus;
  indicator: Indicator;
  busy: boolean;
}

/** A key for what the indicator shows, so an unchanged pass leaves the DOM alone. */
export function drawnKey({ status, indicator, busy }: Drawn): string {
  return [indicator.tone, status.behind, status.ahead, busy, indicator.label].join("|");
}

/** Redraws the indicator's contents for a status. */
export function draw(
  doc: Document,
  button: HTMLButtonElement,
  newThread: HTMLButtonElement,
  drawn: Drawn,
): void {
  const key = drawnKey(drawn);
  if (button.dataset.drawn === key) return;
  button.dataset.drawn = key;

  const { project, status, indicator, busy } = drawn;
  // Spinning while a click fetches, and while the sync script it started runs.
  const spinning = busy || indicator.tone === "running";
  const iconClass = newThread.querySelector("svg")?.getAttribute("class") ?? null;
  const flagged = needsDot(indicator.tone);
  const glyph = icon(doc, !busy && indicator.tone === "error" ? "triangle" : "sync", iconClass, spinning);
  if (indicator.tone === "error") glyph.style.color = "var(--warning-text)";
  button.replaceChildren(glyph, ...(flagged && !busy ? [dot(doc)] : []));

  const label = busy ? `${project}: fetching from ${status.upstream}…` : indicator.label;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.disabled = spinning;
  button.setAttribute("data-tone", indicator.tone);

  // The button shows only while the row is hovered, keeping the invisible
  // button from taking clicks, except while spinning, so a click is answered.
  button.classList.toggle(HOVER_ONLY_CLASS, !spinning);
}

/** Whether a tone carries the out-of-date dot: behind, diverged, or a failed pull. */
export function needsDot(tone: Indicator["tone"]): boolean {
  return tone === "behind" || tone === "diverged" || tone === "error";
}

/** The amber dot, ringed in the sidebar's color, at the icon's top right. */
function dot(doc: Document): HTMLSpanElement {
  const span = doc.createElement("span");
  span.setAttribute("data-checkout-sync-dot", "");
  span.setAttribute("aria-hidden", "true");
  Object.assign(span.style, {
    position: "absolute",
    top: "5px",
    right: "5px",
    width: "7px",
    height: "7px",
    borderRadius: "999px",
    background: "var(--warning)",
    boxShadow: "0 0 0 1.5px var(--sidebar)",
    pointerEvents: "none",
  });
  return span;
}

// Drawing the indicator into bb's sidebar project headers.
//
// It sits in the header's trailing controls (`data-sidebar-trailing-controls`
// in bb's `TopLevelSidebarSection.tsx`), before the hover actions rather than
// inside them, so a checkout that is behind shows without hovering. An
// up-to-date checkout takes bb's own hover-actions class and shows only on
// hover, like the buttons beside it.
import type { CheckoutStatus, Indicator } from "./rules";

/** Marks the indicator this hack adds, so a pass can find and remove its own. */
export const INDICATOR_ATTR = "data-bb-hacks-checkout-sync";

/** bb's class for controls revealed when the row is hovered. */
const HOVER_ONLY_CLASS = "bb-sidebar-hover-actions";

/**
 * bb's theme variables, set inline because the copied button class already
 * sets a muted text color that a second color class would not reliably beat.
 */
const TONE_COLORS: Record<Indicator["tone"], string> = {
  synced: "",
  ahead: "",
  behind: "var(--sidebar-foreground)",
  diverged: "var(--sidebar-foreground)",
  error: "var(--warning-text)",
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** Lucide icons, drawn the way bb draws its own sidebar icons. */
const ICONS = {
  check: ["M20 6 9 17l-5-5"],
  arrowDown: ["M12 5v14", "m19 12-7 7-7-7"],
  arrowUp: ["m5 12 7-7 7 7", "M12 19V5"],
  triangle: [
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    "M12 9v4",
    "M12 17h.01",
  ],
  refresh: [
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
  // bb's control class is a fixed square; the counts need room.
  button.style.width = "auto";
  button.style.minWidth = "1.75rem";
  button.style.paddingInline = "0.25rem";
  button.style.gap = "0.125rem";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.fontSize = "0.75rem";
  button.style.fontVariantNumeric = "tabular-nums";
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

function count(doc: Document, value: number): HTMLSpanElement {
  const span = doc.createElement("span");
  span.textContent = String(value);
  return span;
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
  const iconClass = newThread.querySelector("svg")?.getAttribute("class") ?? null;
  const parts: Node[] = [];
  if (busy) {
    parts.push(icon(doc, "refresh", iconClass, true));
  } else if (indicator.tone === "error") {
    parts.push(icon(doc, "triangle", iconClass, false));
  } else if (indicator.tone === "synced") {
    parts.push(icon(doc, "check", iconClass, false));
  } else {
    if (status.behind > 0) parts.push(icon(doc, "arrowDown", iconClass, false), count(doc, status.behind));
    if (status.ahead > 0) parts.push(icon(doc, "arrowUp", iconClass, false), count(doc, status.ahead));
  }
  button.replaceChildren(...parts);

  const label = busy ? `${project}: fetching from ${status.upstream}…` : indicator.label;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.disabled = busy;
  button.setAttribute("data-tone", indicator.tone);

  // Behind or failed asks for attention; up to date shows only on hover.
  button.classList.toggle(HOVER_ONLY_CLASS, indicator.tone === "synced" && !busy);
  button.style.color = TONE_COLORS[indicator.tone];
}

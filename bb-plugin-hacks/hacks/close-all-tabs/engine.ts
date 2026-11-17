// The sync loop: what adds a Close all tabs button to the side panel's tab
// strip.
//
// bb offers "Close other tabs" and "Close tabs to the right" on a tab's
// context menu, but nothing that closes every tab at once. Each unpinned tab
// renders its own close button (`data-tab-pill-close`), hidden until hover,
// so closing them all is a matter of clicking each one. Pinned tabs have no
// close button, so they stay, as they do for bb's own menu items.
//
// Every anchor here is something bb emits deliberately:
// `data-testid="secondary-panel-tab-strip"` on the strip,
// `data-tab-pill-close` on each tab's close button, and `data-panel-new-tab`
// on the "+" button that follows the strip, whose look this button copies.

/** Marks the button this hack adds, so a pass can find and remove its own. */
export const BUTTON_ATTR = "data-bb-hacks-close-all-tabs";

const STRIP_SELECTOR = '[data-testid="secondary-panel-tab-strip"]';
const CLOSE_SELECTOR = "[data-tab-pill-close]";
const NEW_TAB_SELECTOR = "[data-panel-new-tab]";

export const LABEL = "Close all tabs";

/** The fewest closable tabs that get the button. */
const MIN_TABS = 2;

/** Lucide's `copy-x`: two stacked tabs with an x, so it reads as "all". */
const ICON_PATHS = [
  "M12 12l6 6",
  "M12 18l6-6",
  "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
];

export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  /** The document holding bb's side panel. */
  doc: Document;
  /** Defer a pass. Returns a cancel function. `requestAnimationFrame` in bb. */
  defer: (run: () => void) => () => void;
}

export interface Engine {
  /** Run a pass now, skipping the scheduler. Tests use this. */
  syncNow: () => void;
  /** Ask for a pass on the next frame. */
  schedule: () => void;
  dispose: () => void;
}

/** Clicks every tab's close button in the strip. Pinned tabs have none. */
export function closeAllTabs(strip: Element): void {
  // Snapshot first: React may re-render between clicks and drop buttons
  // from the strip, and a button that has left the page is already closed.
  const buttons = Array.from(
    strip.querySelectorAll<HTMLButtonElement>(CLOSE_SELECTOR),
  );
  for (const button of buttons) {
    if (button.isConnected) button.click();
  }
}

function createButton(
  doc: Document,
  template: Element,
  strip: Element,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.setAttribute(BUTTON_ATTR, "");
  button.className = template.getAttribute("class") ?? "";
  button.setAttribute("aria-label", LABEL);
  button.title = LABEL;

  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  // bb sizes its icons through `data-icon-root` and the button's classes, and
  // draws them with a thinner stroke than Lucide's default.
  const templateIcon = template.querySelector("svg");
  const iconClass = templateIcon?.getAttribute("class");
  if (iconClass) svg.setAttribute("class", iconClass);
  svg.setAttribute("data-icon-root", "");
  const strokeWidth =
    templateIcon?.querySelector("[stroke-width]")?.getAttribute("stroke-width") ??
    "1.5";
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", strokeWidth);
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (const [name, value] of Object.entries({
    width: "14",
    height: "14",
    x: "8",
    y: "8",
    rx: "2",
    ry: "2",
  })) {
    rect.setAttribute(name, value);
  }
  svg.append(rect);
  for (const d of ICON_PATHS) {
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  button.append(svg);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    // The strip this button was placed after, looked up again in case bb
    // remounted it since.
    const current =
      button.previousElementSibling?.matches(STRIP_SELECTOR) === true
        ? button.previousElementSibling
        : strip;
    closeAllTabs(current);
  });
  return button;
}

export function startEngine(deps: EngineDeps): Engine {
  const { signal, doc, defer } = deps;

  let writing = false;
  let cancel: (() => void) | null = null;

  function schedule(): void {
    if (signal.aborted || cancel !== null) return;
    cancel = defer(() => {
      cancel = null;
      syncNow();
    });
  }

  function syncNow(): void {
    if (signal.aborted) return;
    writing = true;
    try {
      const keep = new Set<Element>();
      for (const strip of doc.querySelectorAll(STRIP_SELECTOR)) {
        const count = strip.querySelectorAll(CLOSE_SELECTOR).length;
        if (count < MIN_TABS) continue;
        const parent = strip.parentElement;
        if (parent === null) continue;
        const template =
          parent.querySelector(`:scope > ${NEW_TAB_SELECTOR}`) ??
          doc.querySelector(NEW_TAB_SELECTOR);
        if (template === null) continue;

        const next = strip.nextElementSibling;
        let button =
          next?.hasAttribute(BUTTON_ATTR) === true
            ? (next as HTMLButtonElement)
            : null;
        if (button === null) {
          button = createButton(doc, template, strip);
          strip.after(button);
        }
        keep.add(button);
      }
      // A button whose strip went away, dropped below two tabs, or was
      // remounted elsewhere by React.
      for (const button of doc.querySelectorAll(`[${BUTTON_ATTR}]`)) {
        if (!keep.has(button)) button.remove();
      }
    } finally {
      writing = false;
    }
  }

  const observer = new doc.defaultView!.MutationObserver(() => {
    if (writing) return;
    schedule();
  });
  observer.observe(doc.body, { childList: true, subtree: true });

  schedule();

  return {
    syncNow,
    schedule,
    dispose() {
      observer.disconnect();
      if (cancel !== null) cancel();
      cancel = null;
      for (const button of doc.querySelectorAll(`[${BUTTON_ATTR}]`)) {
        button.remove();
      }
    },
  };
}

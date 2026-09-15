// Reading and decorating bb's diff card headers.
//
// bb owns this DOM. `experimental_diffRenderer` replaces a diff's body, and
// the header's `statSlot`/`actionSlot` are internal to bb — the left-hand icon
// group this pencil belongs in has no slot at all. Decorating existing
// app-shell DOM is what content scripts are for.
//
// Everything here anchors on the most stable thing bb actually emits: the
// toggle's `aria-expanded`, the header's two-child structure, the path
// control's `title`, and the accessible names of the two icons beside it. Read
// GitDiffCardHeader in app/dist/assets before changing an assumption, and see
// `diff/fixture.ts` for the shape it renders:
//
//   <div class="… items-center justify-between …">        <- headerRow
//     <span class="flex min-w-0 items-center">            <- left
//       <button aria-label="Collapse docs/a.md" aria-expanded="true">…</button>
//       <span class="… gap-1.5 pl-[1ch]">                 <- iconGroup
//         <button title="docs/a.md">docs/a.md</button>     <- pathButton
//         <button aria-label="Copy path for docs/a.md">…</button>
//         <button aria-label="Open docs/a.md in editor">…</button>
//       </span>
//     </span>
//     <span class="flex shrink-0 items-center gap-1">{actionSlot}{+12 -3}</span>
//   </div>
import { PencilEdit02Icon } from "@hugeicons/core-free-icons";

/** Marks a node this plugin created, so cleanup can find every one of them. */
export const OWNED_ATTR = "data-markdown-editor-owned";

/**
 * The changes-panel toolbar. Its presence is how this plugin knows the panel
 * is open at all: the file card list below it carries no attribute of its own,
 * and scanning every screen for `aria-expanded` would cost something on the
 * many screens that hold no diff.
 */
export const TOOLBAR_SELECTOR = '[data-testid="git-diff-toolbar-actions"]';

/** Timeline diffs, deliberately out of scope: they are a read-only record of
 * what an agent changed, not a file you are about to edit. */
const TIMELINE_SELECTOR = "[data-timeline-file-diff]";

/** One diff card header, resolved to the parts this plugin touches. */
export interface DiffHeader {
  /** The workspace-relative path, as bb resolved it for opening. */
  path: string;
  /** The group holding the path and bb's copy and open-in-editor icons. */
  iconGroup: HTMLElement;
  /**
   * bb's own path control, whose click is bb's open-file-preview intent, or
   * null when bb rendered the path as a plain span because there is nothing
   * to open.
   */
  pathButton: HTMLButtonElement | null;
}

export function findToolbar(root: ParentNode): HTMLElement | null {
  const toolbar = root.querySelector(TOOLBAR_SELECTOR);
  return toolbar instanceof HTMLElement ? toolbar : null;
}

/**
 * Resolve a collapse control to the header it belongs to, or null when the
 * element is not a diff card header after all.
 *
 * There is deliberately no "must be inside the changes panel" check — the card
 * list has no container attribute, and requiring one that only looked right is
 * what once made diff-viewed match nothing at all. The structural checks carry
 * that weight, and they are strict enough that a bare `aria-expanded`
 * disclosure elsewhere in the app cannot pass.
 */
export function resolveHeader(toggle: Element): DiffHeader | null {
  if (!(toggle instanceof HTMLButtonElement)) return null;
  const expanded = toggle.getAttribute("aria-expanded");
  if (expanded !== "true" && expanded !== "false") return null;
  if (toggle.closest(TIMELINE_SELECTOR) !== null) return null;

  const left = toggle.parentElement;
  if (left === null || left.firstElementChild !== toggle) return null;
  const headerRow = left.parentElement;
  if (headerRow === null || headerRow.childElementCount !== 2) return null;
  if (!headerRow.classList.contains("justify-between")) return null;

  const iconGroup = left.lastElementChild;
  if (!(iconGroup instanceof HTMLElement) || iconGroup === toggle) return null;

  const pathButton = findPathButton(iconGroup);
  // The title is the path bb itself would open, which is why it is preferred
  // over the toggle's accessible name: for a rename that name reads
  // "docs/old.md -> docs/new.md", and neither half of it is a path.
  const path = pathButton?.title ?? titleOfPathSpan(iconGroup);
  if (path === null || path === "") return null;

  return { path, iconGroup, pathButton };
}

/**
 * bb's path control among the icons beside it.
 *
 * The discriminator is `title` without `aria-label`: bb gives the path control
 * a `title` and no accessible name of its own, while the copy and
 * open-in-editor icons are the other way round. Matching on position instead
 * would break on a rename, where two extra nodes come first.
 */
function findPathButton(iconGroup: HTMLElement): HTMLButtonElement | null {
  for (const candidate of iconGroup.querySelectorAll("button[title]")) {
    if (candidate.hasAttribute("aria-label")) continue;
    if (candidate.hasAttribute(OWNED_ATTR)) continue;
    if (candidate instanceof HTMLButtonElement) return candidate;
  }
  return null;
}

/** The path when bb rendered it as a plain truncated span. */
function titleOfPathSpan(iconGroup: HTMLElement): string | null {
  for (const candidate of iconGroup.querySelectorAll("span[title]")) {
    const title = candidate.getAttribute("title");
    if (title !== null && title !== "") return title;
  }
  return null;
}

/** Every diff card header currently rendered, in document order. */
export function findHeaders(root: ParentNode): DiffHeader[] {
  const headers: DiffHeader[] = [];
  for (const toggle of root.querySelectorAll("button[aria-expanded]")) {
    const header = resolveHeader(toggle);
    if (header !== null) headers.push(header);
  }
  return headers;
}

/** This plugin's pencil inside a header, if it is still mounted. */
export function existingPencil(header: DiffHeader): HTMLButtonElement | null {
  const pencil = header.iconGroup.querySelector(`button[${OWNED_ATTR}]`);
  return pencil instanceof HTMLButtonElement ? pencil : null;
}

/**
 * Build the pencil.
 *
 * The classes are bb's own open-in-editor button verbatim, so the three
 * file-level icons in this header stay one control strip rather than two that
 * nearly match.
 */
export function createPencil(
  path: string,
  onActivate: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.setAttribute(OWNED_ATTR, "");
  button.type = "button";
  button.className =
    "inline-flex size-5 shrink-0 cursor-pointer items-center justify-center " +
    "rounded-md text-muted-foreground hover:bg-state-hover " +
    "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 " +
    "focus-visible:ring-ring";
  button.setAttribute("aria-label", `Edit ${path} in the markdown editor`);
  button.addEventListener("click", (event) => {
    // The card header is itself clickable in places; a click that reached it
    // would collapse the file the user just asked to edit.
    event.stopPropagation();
    event.preventDefault();
    onActivate();
  });
  button.append(pencilIcon());
  return button;
}

/** React prop names in the icon data that are spelled differently in DOM. */
const ATTRIBUTE_NAMES: Record<string, string> = {
  strokeWidth: "stroke-width",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeDasharray: "stroke-dasharray",
  fillRule: "fill-rule",
  clipRule: "clip-rule",
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The same Hugeicons glyph bb's own icons come from, built as DOM.
 *
 * A content script has no React, so the icon data — `[tag, attrs]` tuples
 * carrying React prop names — is serialized by hand rather than rendered.
 */
function pencilIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "size-3");
  for (const [tag, attributes] of PencilEdit02Icon) {
    const node = document.createElementNS(SVG_NS, String(tag));
    for (const [name, value] of Object.entries(
      attributes as Record<string, unknown>,
    )) {
      if (name === "key" || value === undefined || value === null) continue;
      node.setAttribute(ATTRIBUTE_NAMES[name] ?? name, String(value));
    }
    svg.append(node);
  }
  return svg;
}

/** Remove every node this plugin added under `root`. */
export function undecorate(root: ParentNode): void {
  for (const owned of root.querySelectorAll(`[${OWNED_ATTR}]`)) owned.remove();
}

// Reading bb's rendered diff, and putting comment rows into it.
//
// Every DOM assumption in this plugin lives in this file. bb renders each
// file's diff with @pierre/diffs into a `<diffs-container>` whose shadow root
// is `mode: "open"`, and inside it each side is:
//
//   <code data-code data-unified|data-deletions|data-additions>
//     <div data-gutter  style="grid-row: span N"> ...N cells... </div>
//     <div data-content style="grid-row: span N"> ...N rows...  </div>
//   </code>
//
// Both stacks are `grid-template-rows: subgrid`, so gutter child i lines up
// with content child i BY POSITION, and in split view all four stacks share
// one grid. Three consequences drive everything below:
//
//  1. A comment row must go into BOTH stacks at the same index.
//  2. Both `grid-row: span N` values must become N+1.
//  3. In split view the opposite column needs a blank row at the same index,
//     or the two halves drift a row apart.
//
// Before changing anything here, read DiffHunksRenderer and
// createAnnotationElement in @pierre/diffs — this file mirrors what Pierre
// itself emits for a real annotation, which is why the host stylesheet already
// styles the result.
import type { DiffLine, Side } from "@/comment/types";

/** Marks every node this plugin created, so cleanup can find all of them. */
export const OWNED_ATTR = "data-diff-comment-owned";
/** Set on an injected row that only exists to keep a split's sides in step. */
export const SPACER_ATTR = "data-diff-comment-spacer";
/**
 * The hover affordance. Declared here rather than in the engine because
 * `lineText` has to know to skip it, and that knowledge belongs with the rest
 * of the DOM reading.
 */
export const TRIGGER_ATTR = "data-diff-comment-trigger";

/** Pierre's line types that belong to the old side of the diff. */
const OLD_SIDE_TYPES = new Set(["deletion", "change-deletion"]);

/**
 * A direct child carrying `attr`. Written as a loop rather than
 * `querySelector(":scope > …")` because `:scope` does not resolve inside a
 * shadow tree in jsdom, and this is where the diff always lives.
 */
function childWith(parent: Element, attr: string): HTMLElement | null {
  for (const child of Array.from(parent.children)) {
    if (child instanceof HTMLElement && child.hasAttribute(attr)) return child;
  }
  return null;
}

function gutterOf(code: Element): HTMLElement | null {
  return childWith(code, "data-gutter");
}

function contentOf(code: Element): HTMLElement | null {
  return childWith(code, "data-content");
}

/**
 * Which side of the diff a column's rows belong to. A split column says so
 * outright; in unified it is the line type that decides, and a context line
 * carries the new-side number (that is the number Pierre puts in the gutter).
 */
function sideOf(code: Element, lineType: string | null): Side {
  if (code.hasAttribute("data-deletions")) return "old";
  if (code.hasAttribute("data-additions")) return "new";
  return lineType !== null && OLD_SIDE_TYPES.has(lineType) ? "old" : "new";
}

/**
 * The code text of one line, ignoring anything this plugin put inside it.
 *
 * `row.textContent` is not good enough: the hover affordance is appended into
 * the hovered row, so a plain read picks up its glyph and stores it as part of
 * the comment's anchor text — which then fails to match the real line forever
 * after. Anything owned by this plugin is skipped here.
 */
function lineText(row: Element): string {
  let text = "";
  for (const node of Array.from(row.childNodes)) {
    if (node instanceof Element) {
      if (node.hasAttribute(OWNED_ATTR) || node.hasAttribute(TRIGGER_ATTR)) continue;
      text += lineText(node);
      continue;
    }
    text += node.textContent ?? "";
  }
  return text;
}

/** Every code line currently rendered in one column, in document order. */
export function readLines(code: Element): DiffLine[] {
  const content = contentOf(code);
  if (content === null) return [];

  const lines: DiffLine[] = [];
  for (const row of Array.from(content.children)) {
    const raw = row.getAttribute("data-line");
    if (raw === null) continue;
    const line = Number(raw);
    if (!Number.isInteger(line)) continue;
    lines.push({
      side: sideOf(code, row.getAttribute("data-line-type")),
      line,
      text: lineText(row),
    });
  }
  return lines;
}

/** Adjust a stack's `grid-row: span N`. Returns false when there is no span. */
function bumpSpan(stack: HTMLElement, delta: number): boolean {
  const style = stack.getAttribute("style") ?? "";
  const match = /grid-row:\s*span\s+(\d+)/.exec(style);
  if (match === null) return false;
  stack.setAttribute("style", style.replace(match[0], `grid-row: span ${Number(match[1]) + delta}`));
  return true;
}

/** The other `[data-code]` column of a split, or null in unified view. */
function siblingColumn(code: Element): HTMLElement | null {
  const siblings = Array.from(code.parentElement?.children ?? []);
  return (
    siblings.find(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && el !== code && el.hasAttribute("data-code"),
    ) ?? null
  );
}

/**
 * A row for the content stack. When `slotName` is given, the row holds a named
 * `<slot>` rather than the card itself.
 *
 * The slot is the whole trick. Shadow DOM blocks the app's stylesheet, so a
 * card built inside the shadow root would render unstyled — no Markdown
 * treatment, none of bb's type. Slotted content stays in the light DOM and
 * keeps the document's styles, which is exactly why Pierre fills its own
 * annotations through named slots. So the card lives under the
 * `<diffs-container>` host where React and bb's components work normally, and
 * only a placeholder sits in the shadow tree.
 */
function contentRow(slotName: string | null): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute(OWNED_ATTR, "");
  // Shaped like Pierre's createAnnotationElement, so the stylesheet already
  // inside the shadow root gives it annotation-row treatment for free.
  node.setAttribute("data-line-annotation", "diff-comment");
  if (slotName === null) {
    node.setAttribute(SPACER_ATTR, "");
    return node;
  }
  const inner = document.createElement("div");
  inner.setAttribute("data-annotation-content", "");
  const slot = document.createElement("slot");
  slot.setAttribute("name", slotName);
  inner.append(slot);
  node.append(inner);
  return node;
}

/** Pierre's createGutterGap(lineType, "annotation", 1). */
function gutterCell(lineType: string, spacer: boolean): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute(OWNED_ATTR, "");
  if (spacer) node.setAttribute(SPACER_ATTR, "");
  node.setAttribute("data-gutter-buffer", "annotation");
  node.setAttribute("data-line-type", lineType);
  return node;
}

/** The slot name a comment's card is projected through. */
export function slotNameFor(commentId: string): string {
  return `diff-comment-${commentId}`;
}

/**
 * The light-DOM element a comment's card is rendered into, created on first
 * use. It hangs off the `<diffs-container>` host, which is where slotted
 * content has to live, and carries the app's styles because it never crosses
 * the shadow boundary.
 */
export function cardHolder(host: HTMLElement, commentId: string): HTMLElement {
  const slotName = slotNameFor(commentId);
  const existing = Array.from(host.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.getAttribute("slot") === slotName,
  );
  if (existing !== undefined) return existing;

  const holder = document.createElement("div");
  holder.setAttribute("slot", slotName);
  holder.setAttribute(OWNED_ATTR, "");
  host.append(holder);
  return holder;
}

/** Insert an empty row at `index` so a column keeps pace with its sibling. */
function insertSpacer(code: Element, index: number): boolean {
  const gutter = gutterOf(code);
  const content = contentOf(code);
  if (gutter === null || content === null) return false;
  const anchorRow = content.children[index];
  const anchorCell = gutter.children[index];
  if (anchorRow === undefined || anchorCell === undefined) return false;

  anchorRow.after(contentRow(null));
  anchorCell.after(gutterCell("context", true));
  return bumpSpan(gutter, 1) && bumpSpan(content, 1);
}

/**
 * Open a row directly below `line` in this column, holding a slot that
 * `cardHolder` fills from the light DOM. Returns false when the line is not
 * rendered here, which is the caller's cue to treat the comment as detached
 * rather than to force it somewhere.
 */
export function insertRow(code: Element, line: number, slotName: string): boolean {
  const gutter = gutterOf(code);
  const content = contentOf(code);
  if (gutter === null || content === null) return false;

  const rows = Array.from(content.children);
  const cells = Array.from(gutter.children);
  // Equal lengths are the invariant the subgrid rests on. If they already
  // disagree, something else has edited this DOM and guessing makes it worse.
  if (rows.length !== cells.length) return false;

  const index = rows.findIndex((row) => row.getAttribute("data-line") === String(line));
  if (index === -1) return false;

  const row = contentRow(slotName);
  const cell = gutterCell(rows[index]!.getAttribute("data-line-type") ?? "context", false);

  rows[index]!.after(row);
  cells[index]!.after(cell);
  if (!bumpSpan(gutter, 1) || !bumpSpan(content, 1)) return false;

  const sibling = siblingColumn(code);
  if (sibling !== null) insertSpacer(sibling, index);
  return true;
}

function purge(scope: ParentNode): number {
  let removed = 0;
  for (const node of Array.from(scope.querySelectorAll(`[${OWNED_ATTR}]`))) {
    const stack = node.parentElement;
    node.remove();
    removed += 1;
    // Only rows inside a subgrid stack count against a span. A card holder in
    // the light DOM is not in the grid at all.
    if (stack !== null && stack.matches("[data-gutter], [data-content]")) bumpSpan(stack, -1);
  }
  return removed;
}

/**
 * Remove every node this plugin injected and restore the spans. A comment has
 * a part either side of the shadow boundary — the row in the shadow tree, the
 * card in the light DOM — so cleanup has to cross it too. Passing the
 * `<diffs-container>` host does both.
 *
 * Unmounting without this leaves rows behind that the "already rendered" check
 * then mistakes for live ones, so the next mount silently does nothing.
 *
 * Returns how many nodes were removed, which is what the tests assert on.
 */
export function removeOwned(scope: ParentNode): number {
  let removed = purge(scope);
  if (scope instanceof Element && scope.shadowRoot !== null) {
    removed += purge(scope.shadowRoot);
  }
  return removed;
}

/**
 * The gutter cell that lines up with `line` in this column.
 *
 * The gutter and content stacks align by position, so this is the content
 * row's index applied to the gutter. It is where the hover affordance goes:
 * bb's own `+` lives in this cell, and putting ours anywhere else would leave
 * two unrelated controls for the same line in two different places.
 */
export function gutterCellForLine(code: Element, line: number): HTMLElement | null {
  const gutter = gutterOf(code);
  const content = contentOf(code);
  if (gutter === null || content === null) return null;

  const index = Array.from(content.children).findIndex(
    (row) => row.getAttribute("data-line") === String(line),
  );
  if (index === -1) return null;

  const cell = gutter.children[index];
  return cell instanceof HTMLElement ? cell : null;
}

/** Every diff bb has on screen, as shadow roots we can read and decorate. */
export function findDiffRoots(doc: Document): ShadowRoot[] {
  return Array.from(doc.querySelectorAll("diffs-container"))
    .map((host) => host.shadowRoot)
    .filter((root): root is ShadowRoot => root !== null);
}

/** The `[data-code]` columns inside one diff. */
export function findColumns(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-code]"));
}

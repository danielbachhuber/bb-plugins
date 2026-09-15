// The sync loop: what decorates bb's diff and keeps it agreeing with the
// stored comments.
//
// This lives outside app.tsx so it can be driven under jsdom. Its RPC,
// scheduler, location, and card mounting all arrive as parameters, because the
// wiring between tested pieces is exactly where this kind of plugin breaks —
// each individual function can be right while the loop that calls them is not.
import type { Comment, Side } from "@/comment/types";
import {
  cardHolder,
  findColumns,
  gutterCellForLine,
  insertRow,
  readLines,
  removeOwned,
  slotNameFor,
  OWNED_ATTR,
  TRIGGER_ATTR,
} from "./dom";
import { quoteSelection } from "@/comment/quote";
import { pathForDiff, threadIdFromPath } from "./locate";
import { placeComments, placementKey, type Column } from "./place";

export { TRIGGER_ATTR };
/** The slot a not-yet-saved comment's composer is projected through. */
export const DRAFT_ID = "draft";

/** Where a new comment is being written. */
export interface Draft {
  host: HTMLElement;
  path: string;
  side: Side;
  line: number;
  anchor: { text: string; before: string | null; after: string | null };
  /** Text the composer opens with: a blockquote of whatever was selected. */
  body: string;
}

export interface EngineDeps {
  rpc: <Result>(method: string, input: unknown) => Promise<Result>;
  doc: Document;
  /** The current route, read fresh on every pass. */
  pathname: () => string;
  /** Defer a pass. Returns a cancel function. `requestAnimationFrame` in bb. */
  defer: (run: () => void) => () => void;
  warn: (cause: unknown) => void;
  signal: AbortSignal;
  /** Draw a saved comment into its light-DOM holder. */
  mountCard: (holder: HTMLElement, comment: Comment) => void;
  /** Draw the composer for a new comment into its holder. */
  mountComposer: (holder: HTMLElement, draft: Draft) => void;
  /** Tear down whatever React put in a holder, before it is removed. */
  unmountCard: (holder: HTMLElement) => void;
  /**
   * The text currently selected inside one diff, or "" when nothing is.
   *
   * A dep rather than inline code because reading a selection out of a shadow
   * root is browser-specific — `ShadowRoot.getSelection()` is a Chromium
   * extension — and jsdom implements none of it.
   */
  readSelection: (host: HTMLElement) => string;
  /**
   * Called for every diff on every pass, before it is read or decorated.
   *
   * This exists because a shadow root needs the overlay's stylesheet adopted
   * into it, and diffs appear long after the content script mounts — doing it
   * once at startup means every diff opened later is unstyled, which puts the
   * hover affordance at its static position instead of where it belongs.
   */
  prepareHost: (host: HTMLElement) => void;
}

export interface Engine {
  /** Run a pass now, skipping the scheduler. Tests use this. */
  syncNow: () => void;
  schedule: () => void;
  /** Re-read comments from the server, then re-render. */
  refresh: () => void;
  dispose: () => void;
}

/** Every diff bb currently has on screen, as its shadow host. */
function findDiffHosts(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll("diffs-container")).filter(
    (host): host is HTMLElement => host instanceof HTMLElement && host.shadowRoot !== null,
  );
}

export function startEngine(deps: EngineDeps): Engine {
  const { doc } = deps;

  let threadId: string | null = null;
  let comments: Comment[] | null = null;
  let draft: Draft | null = null;
  let disposed = false;

  /** Last applied placement key per host, so unchanged diffs are left alone. */
  const applied = new WeakMap<HTMLElement, string>();
  /** Hosts whose hover affordance is already wired. */
  const wired = new WeakSet<HTMLElement>();
  /** Holders with something React-mounted in them, needing unmount on removal. */
  const mounted = new Set<HTMLElement>();

  let pending: (() => void) | null = null;

  function schedule(): void {
    if (disposed || pending !== null) return;
    pending = deps.defer(() => {
      pending = null;
      syncNow();
    });
  }

  async function load(): Promise<void> {
    if (threadId === null) return;
    const target = threadId;
    try {
      const result = await deps.rpc<{ comments: Comment[] }>("comments_list", {
        threadId: target,
      });
      // The route may have changed while the request was in flight; a late
      // reply for a thread we have left must not overwrite the current one.
      if (disposed || threadId !== target) return;
      comments = result.comments;
      schedule();
    } catch (cause) {
      deps.warn(cause);
    }
  }

  function unmountHolders(host: HTMLElement): void {
    for (const holder of Array.from(host.children)) {
      if (holder instanceof HTMLElement && mounted.has(holder)) {
        deps.unmountCard(holder);
        mounted.delete(holder);
      }
    }
  }

  /** Put the comment rows for one diff in place, rebuilding only if needed. */
  function decorate(host: HTMLElement, all: Comment[]): void {
    const root = host.shadowRoot;
    if (root === null) return;

    const path = pathForDiff(host);
    // No path means this is not a changes-panel card — a timeline diff, or a
    // diff somewhere this plugin has no business decorating. Leave it alone.
    if (path === null) return;

    const columns: Column[] = findColumns(root).map((element) => ({
      element,
      lines: readLines(element),
    }));
    if (columns.length === 0) return;

    const { placements } = placeComments(
      all.filter((comment) => comment.path === path),
      columns,
    );

    const draftHere = draft !== null && draft.host === host;
    const key = `${placementKey(placements, columns)}${draftHere ? `|draft@${draft!.side}:${draft!.line}` : ""}`;

    // A re-render by bb drops our rows without changing the placements, so
    // presence has to be checked as well as the key — otherwise the rows never
    // come back. Counting the content rows we own is enough to tell.
    const expectedRows = placements.length + (draftHere ? 1 : 0);
    const actualRows = root.querySelectorAll(`[${OWNED_ATTR}][data-line-annotation]`).length;
    if (applied.get(host) === key && actualRows === expectedRows) return;

    unmountHolders(host);
    removeOwned(host);

    for (const placement of placements) {
      if (!insertRow(placement.column, placement.line, slotNameFor(placement.comment.id))) {
        continue;
      }
      const holder = cardHolder(host, placement.comment.id);
      deps.mountCard(holder, placement.comment);
      mounted.add(holder);
    }

    if (draftHere) {
      const column = columns.find((candidate) =>
        candidate.lines.some(
          (line) => line.line === draft!.line && line.side === draft!.side,
        ),
      );
      if (column !== undefined && insertRow(column.element, draft!.line, slotNameFor(DRAFT_ID))) {
        const holder = cardHolder(host, DRAFT_ID);
        deps.mountComposer(holder, draft!);
        mounted.add(holder);
      }
    }

    applied.set(host, key);
  }

  /**
   * The hover affordance: a comment button that follows the pointer down the
   * gutter, sitting beside bb's own `+` for the same line.
   *
   * One button at a time, moved into whichever line is under the pointer,
   * rather than a button per line — a long file has hundreds of lines and bb
   * re-renders them often.
   *
   * It goes in the GUTTER cell rather than the code row for two reasons. It is
   * where bb keeps its own per-line control, so the two read as a pair; and
   * the code rows are rebuilt by Pierre on every line selection, which took
   * the button out from under the pointer before its click could land.
   */
  function wireTrigger(host: HTMLElement): void {
    const root = host.shadowRoot;
    if (root === null || wired.has(host)) return;
    wired.add(host);

    const button = doc.createElement("button");
    button.setAttribute(TRIGGER_ATTR, "");
    button.type = "button";
    button.title = "Comment on this line";
    button.setAttribute("aria-label", "Comment on this line");
    // An inline SVG rather than a glyph: an emoji speech bubble renders at a
    // different size and colour on every platform, and a "+" would read as a
    // second copy of bb's own control sitting next to it. 16px in a 16 viewBox
    // matches what Pierre draws in its own gutter button, so the two icons are
    // the same size.
    button.innerHTML =
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" ' +
      'stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">' +
      '<path d="M3 4h10v6.5H7L4.5 13v-2.5H3z"/></svg>';

    let target: { column: Element; line: number; side: Side } | null = null;

    const hide = () => {
      target = null;
      button.remove();
    };

    const openDraft = () => {
      if (target === null) return;
      const path = pathForDiff(host);
      if (path === null) return;

      const lines = readLines(target.column);
      const index = lines.findIndex(
        (candidate) => candidate.line === target!.line && candidate.side === target!.side,
      );
      if (index === -1) return;

      draft = {
        host,
        path,
        side: target.side,
        line: target.line,
        anchor: {
          text: lines[index]!.text,
          before: lines[index - 1]?.text ?? null,
          after: lines[index + 1]?.text ?? null,
        },
        // Read before the press clears it. `preventDefault` on pointerdown is
        // what keeps the selection alive long enough to get here.
        body: quoteSelection(deps.readSelection(host)),
      };
      hide();
      syncNow();
    };

    root.addEventListener(
      "pointerover",
      (event) => {
        // Hovering the gutter counts as hovering the line, so the button does
        // not vanish the moment the pointer moves towards it.
        const node = (event.target as Element | null)?.closest?.(
          "[data-line], [data-column-number]",
        );
        if (node === null || node === undefined) return;
        const column = node.closest("[data-code]");
        if (column === null) return;

        const raw =
          node.getAttribute("data-line") ?? node.getAttribute("data-column-number");
        const line = Number(raw);
        if (!Number.isInteger(line)) return;

        const side = readLines(column).find((candidate) => candidate.line === line)?.side;
        if (side === undefined) return;

        const cell = gutterCellForLine(column, line);
        if (cell === null) return;

        target = { column, line, side };
        cell.append(button);
      },
      { signal: deps.signal },
    );

    // Leaving the diff, or the window losing focus, puts the button away. It
    // is a pointer affordance; leaving it behind on the last line hovered
    // reads as a permanent mark on that line.
    root.addEventListener("pointerleave", hide, { signal: deps.signal });
    host.addEventListener("pointerleave", hide, { signal: deps.signal });
    doc.defaultView?.addEventListener("blur", hide, { signal: deps.signal });

    // Pierre starts a line selection on pointerdown and re-renders the row
    // underneath, so the press is taken here before it reaches that handler.
    // `click` still fires for keyboard activation, where there is no pointer.
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDraft();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      // A pointer press already handled this; only a keyboard press gets here
      // with the target still set.
      openDraft();
    });
  }

  function syncNow(): void {
    if (disposed) return;

    const nextThreadId = threadIdFromPath(deps.pathname());
    if (nextThreadId !== threadId) {
      threadId = nextThreadId;
      comments = null;
      draft = null;
      void load();
      return;
    }
    if (threadId === null || comments === null) return;

    for (const host of findDiffHosts(doc)) {
      try {
        deps.prepareHost(host);
        wireTrigger(host);
        decorate(host, comments);
      } catch (cause) {
        // One malformed diff must not stop the rest of the panel decorating.
        deps.warn(cause);
      }
    }
  }

  /** Called by the card and composer components once a write lands. */
  function refresh(): void {
    draft = null;
    void load();
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(doc.body, { childList: true, subtree: true });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    pending?.();
    pending = null;
    for (const host of findDiffHosts(doc)) {
      unmountHolders(host);
      removeOwned(host);
      host.shadowRoot?.querySelector(`[${TRIGGER_ATTR}]`)?.remove();
    }
  }

  deps.signal.addEventListener("abort", dispose);
  schedule();

  return { syncNow, schedule, refresh, dispose };
}

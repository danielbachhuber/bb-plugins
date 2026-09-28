// The sync loop for bb's Plugins screen: keeps a My plugins row in its
// sidebar and, on /plugins?view=mine, a container in its main panel for the
// page to be portaled into. Kept apart from React so it can be driven under
// jsdom.
import {
  ACTIVE_ATTR,
  ACTIVE_ROW_CLASS,
  MINE_HREF,
  ROOT_ATTR,
  ROW_ATTR,
  buildRow,
  ensureStyle,
  findPanel,
  findPluginsSidebar,
  isMineView,
  removeStyle,
} from "./dom";

export interface ScreenEngineDeps {
  signal: AbortSignal;
  doc: Document;
  location: () => { pathname: string; search: string };
  /** Defer a pass. Returns a cancel function. `requestAnimationFrame` in bb. */
  defer: (run: () => void) => () => void;
  /** Navigate inside bb without a reload. */
  navigate: (to: string) => void;
  /** The container to portal the page into, or null when it is not shown. */
  onPanel: (container: HTMLElement | null) => void;
}

export interface ScreenEngine {
  /** Run a pass now, skipping the scheduler. Tests use this. */
  syncNow: () => void;
  dispose: () => void;
}

export function startScreenEngine(deps: ScreenEngineDeps): ScreenEngine {
  const { signal, doc, defer } = deps;
  let pending = false;
  let cancel: (() => void) | null = null;
  let container: HTMLElement | null = null;
  // The row bb marked current while the page is shown, whose highlight was
  // taken away. bb does not re-render it on leaving (its idea of the current
  // page never changed), so it is given back here.
  let demoted: HTMLAnchorElement | null = null;

  function onClick(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    deps.navigate(MINE_HREF);
  }

  function setContainer(next: HTMLElement | null): void {
    if (next === container) return;
    container = next;
    deps.onPanel(next);
  }

  function restoreDemoted(): void {
    if (demoted === null) return;
    demoted.setAttribute("aria-current", "page");
    demoted.classList.add(ACTIVE_ROW_CLASS);
    demoted = null;
  }

  function syncRow(mine: boolean): void {
    const sidebar = findPluginsSidebar(doc);
    const parent = sidebar?.installed.parentElement ?? null;
    let row = parent?.querySelector<HTMLAnchorElement>(`:scope > [${ROW_ATTR}]`) ?? null;
    if (sidebar && parent && row === null) {
      row = buildRow(sidebar.idle, onClick);
      sidebar.installed.after(row);
    }
    if (row === null) return;

    if (mine) {
      if (!row.hasAttribute("aria-current")) {
        row.setAttribute("aria-current", "page");
        row.classList.add(ACTIVE_ROW_CLASS);
      }
      const current = parent?.querySelector<HTMLAnchorElement>(
        `:scope > a[aria-current="page"]:not([${ROW_ATTR}])`,
      );
      if (current) {
        current.removeAttribute("aria-current");
        current.classList.remove(ACTIVE_ROW_CLASS);
        demoted = current;
      }
    } else {
      if (row.hasAttribute("aria-current")) {
        row.removeAttribute("aria-current");
        row.classList.remove(ACTIVE_ROW_CLASS);
      }
      restoreDemoted();
    }
  }

  function syncPanel(mine: boolean): void {
    const panel = mine ? findPanel(doc) : null;
    if (panel === null) {
      clearPanel();
      return;
    }
    ensureStyle(doc);
    if (!panel.hasAttribute(ACTIVE_ATTR)) panel.setAttribute(ACTIVE_ATTR, "");
    let root = panel.querySelector<HTMLElement>(`:scope > [${ROOT_ATTR}]`);
    if (root === null) {
      root = doc.createElement("div");
      root.setAttribute(ROOT_ATTR, "");
      panel.append(root);
    }
    setContainer(root);
  }

  function clearPanel(): void {
    for (const panel of doc.querySelectorAll(`[${ACTIVE_ATTR}]`)) panel.removeAttribute(ACTIVE_ATTR);
    for (const root of doc.querySelectorAll(`[${ROOT_ATTR}]`)) root.remove();
    setContainer(null);
  }

  function syncNow(): void {
    if (signal.aborted) return;
    const mine = isMineView(deps.location());
    syncRow(mine);
    syncPanel(mine);
  }

  function schedule(): void {
    if (signal.aborted || pending) return;
    pending = true;
    // A flag rather than the cancel handle, because a defer that runs its
    // callback at once returns the handle after the pass has already finished.
    const handle = defer(() => {
      pending = false;
      cancel = null;
      syncNow();
    });
    cancel = pending ? handle : null;
  }

  // bb's router changes the URL with pushState, which fires no event, but
  // every route change redraws part of the page, so DOM changes are the cue.
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  const win = doc.defaultView;
  win?.addEventListener("popstate", schedule);
  schedule();

  function dispose(): void {
    observer.disconnect();
    win?.removeEventListener("popstate", schedule);
    cancel?.();
    cancel = null;
    pending = false;
    restoreDemoted();
    for (const row of doc.querySelectorAll(`[${ROW_ATTR}]`)) row.remove();
    clearPanel();
    removeStyle(doc);
  }

  signal.addEventListener("abort", dispose, { once: true });
  return { syncNow, dispose };
}

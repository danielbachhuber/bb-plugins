// The sync loop: keeps a "My plugins" row in bb's Plugins sidebar while
// Plugin Shelf is installed and enabled.
//
// This lives outside index.ts so it can be driven under jsdom, the same split
// the other hacks use.
import { ROW_ATTR, SHELF_PATH, buildRow, findPluginsSidebar } from "./sidebar";

export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  doc: Document;
  /** Defer a pass. Returns a cancel function. `requestAnimationFrame` in bb. */
  defer: (run: () => void) => () => void;
  /** Whether Plugin Shelf is installed and enabled. */
  loadShelfEnabled: () => Promise<boolean>;
  /** Navigate inside bb without a reload. */
  navigate: (path: string) => void;
  warn: (message: string, error: unknown) => void;
}

export interface Engine {
  /** Run a pass now, skipping the scheduler. Tests use this. */
  syncNow: () => void;
  /** Resolves once the shelf check has settled. Tests use this. */
  ready: Promise<void>;
  dispose: () => void;
}

export function startEngine(deps: EngineDeps): Engine {
  const { signal, doc, defer } = deps;
  let enabled = false;
  let pending = false;
  let cancel: (() => void) | null = null;

  function onClick(event: MouseEvent): void {
    // A modified click opens a new window or tab the browser's way.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    deps.navigate(SHELF_PATH);
  }

  function syncNow(): void {
    if (signal.aborted || !enabled) return;
    const sidebar = findPluginsSidebar(doc);
    if (sidebar === null) return;
    const parent = sidebar.installed.parentElement!;
    if (parent.querySelector(`:scope > [${ROW_ATTR}]`)) return;
    sidebar.installed.after(buildRow(sidebar.idle, onClick));
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

  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });

  const ready = deps
    .loadShelfEnabled()
    .then((value) => {
      enabled = value;
      schedule();
    })
    .catch((error) => deps.warn("could not check for Plugin Shelf", error));

  function dispose(): void {
    observer.disconnect();
    cancel?.();
    cancel = null;
    pending = false;
    for (const row of doc.querySelectorAll(`[${ROW_ATTR}]`)) row.remove();
  }

  signal.addEventListener("abort", dispose, { once: true });

  return { syncNow, ready, dispose };
}

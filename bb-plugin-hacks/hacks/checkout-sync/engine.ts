// The sync loop: keeps a checkout indicator on every project header whose
// main checkout tracks an upstream, and refreshes it on a timer.
//
// This lives outside index.ts so it can be driven under jsdom.
import { findProjectHeaders } from "../project-open-in-editor/sidebar";
import { indicatorFor, type ProjectCheckout } from "./rules";
import { anchorFor, createIndicator, draw, INDICATOR_ATTR } from "./sidebar";

export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  /** The document holding bb's sidebar. */
  doc: Document;
  /** Defer a pass. Returns a cancel function. `requestAnimationFrame` in bb. */
  defer: (run: () => void) => () => void;
  /** Run after `ms` milliseconds. Returns a cancel function. `setTimeout` in bb. */
  wait: (run: () => void, ms: number) => () => void;
  /** Whether the window is hidden, when there is no point polling. */
  hidden: () => boolean;
  loadStatus: (projectIds: string[]) => Promise<Record<string, ProjectCheckout>>;
  pull: (projectId: string) => Promise<ProjectCheckout>;
  /** Where a failed load or pull is reported. */
  warn: (message: string, error: unknown) => void;
}

export interface Engine {
  /** Run a pass now, skipping the scheduler. Tests use this. */
  syncNow: () => void;
  /** Reload every project's status now. Tests use this. */
  refresh: () => Promise<void>;
  /** Tell the engine the window became visible again. */
  wake: () => void;
  dispose: () => void;
}

/**
 * How often the status is read. The server fetches from the remote at most
 * every five minutes, so most reads only compare local refs.
 */
export const POLL_MS = 60_000;

/** How often the status is read while a sync script is running, so its end shows soon. */
export const RUNNING_POLL_MS = 3_000;

export function startEngine(deps: EngineDeps): Engine {
  const { signal, doc, defer } = deps;

  const checkouts = new Map<string, ProjectCheckout>();
  const busy = new Set<string>();
  // Rows that were loaded and came back with nothing, so a project that never
  // has a checkout here does not reload on every pass.
  const missing = new Set<string>();
  let loading: Promise<void> | null = null;
  let writing = false;
  let cancel: (() => void) | null = null;
  let cancelPoll: (() => void) | null = null;
  let disposed = false;

  function schedule(): void {
    if (signal.aborted || cancel !== null) return;
    cancel = defer(() => {
      cancel = null;
      syncNow();
    });
  }

  function rowIds(): string[] {
    const ids = new Set<string>();
    for (const row of doc.querySelectorAll<HTMLElement>("[data-sidebar-project-id]")) {
      const id = row.getAttribute("data-sidebar-project-id");
      if (id) ids.add(id);
    }
    return [...ids];
  }

  function refresh(): Promise<void> {
    if (loading !== null) return loading;
    const ids = rowIds();
    if (ids.length === 0) return Promise.resolve();
    loading = deps
      .loadStatus(ids)
      .then((result) => {
        for (const id of ids) {
          const value = result[id];
          if (value) checkouts.set(id, value);
          else checkouts.delete(id);
        }
      })
      .catch((error) => deps.warn("could not read checkout status", error))
      .finally(() => {
        loading = null;
        schedule();
      });
    return loading;
  }

  function scriptRunning(): boolean {
    for (const checkout of checkouts.values()) if (checkout.run?.state === "running") return true;
    return false;
  }

  function poll(): void {
    if (signal.aborted || disposed) return;
    if (cancelPoll !== null) cancelPoll();
    cancelPoll = deps.wait(
      () => {
        cancelPoll = null;
        if (deps.hidden()) poll();
        else void refresh().then(poll);
      },
      scriptRunning() ? RUNNING_POLL_MS : POLL_MS,
    );
  }

  function pullProject(projectId: string): void {
    if (busy.has(projectId)) return;
    busy.add(projectId);
    schedule();
    deps
      .pull(projectId)
      .then((value) => {
        checkouts.set(projectId, value);
        // A sync script the pull started is polled for more often.
        if (value.run?.state === "running") poll();
      })
      .catch((error) => deps.warn(`could not pull ${projectId}`, error))
      .finally(() => {
        busy.delete(projectId);
        schedule();
      });
  }

  function syncNow(): void {
    if (signal.aborted) return;
    const headers = findProjectHeaders(doc, (id) => checkouts.get(id)?.name ?? null);
    const keep = new Set<HTMLButtonElement>();
    writing = true;
    try {
      for (const header of headers) {
        const checkout = checkouts.get(header.projectId);
        if (!checkout?.status) continue;
        const anchor = anchorFor(header.newThread);
        if (!anchor?.parentElement) continue;

        let button = anchor.parentElement.querySelector<HTMLButtonElement>(
          `:scope > button[${INDICATOR_ATTR}]`,
        );
        if (button === null) {
          const projectId = header.projectId;
          button = createIndicator(doc, header.newThread, () => pullProject(projectId));
          anchor.before(button);
        }
        draw(doc, button, header.newThread, {
          project: checkout.name,
          status: checkout.status,
          indicator: indicatorFor(checkout.name, checkout.status, checkout.run ?? null),
          busy: busy.has(header.projectId),
        });
        keep.add(button);
      }
      for (const button of doc.querySelectorAll<HTMLButtonElement>(`button[${INDICATOR_ATTR}]`)) {
        if (!keep.has(button)) button.remove();
      }
    } finally {
      writing = false;
    }

    // A project row that has appeared since the last load, such as a newly
    // added project, is loaded rather than waiting for the next poll.
    if (loading === null && rowIds().some((id) => !checkouts.has(id) && !missing.has(id))) {
      for (const id of rowIds()) if (!checkouts.has(id)) missing.add(id);
      void refresh();
    }
  }

  const observer = new doc.defaultView!.MutationObserver(() => {
    if (writing) return;
    schedule();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "data-sidebar-project-id"],
  });

  // The first load decides the first interval: a script already running, such
  // as one that reloaded this plugin, is polled for at once.
  void refresh().then(poll);

  return {
    syncNow,
    refresh,
    wake() {
      void refresh();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      if (cancel !== null) cancel();
      cancel = null;
      if (cancelPoll !== null) cancelPoll();
      cancelPoll = null;
      for (const button of doc.querySelectorAll(`button[${INDICATOR_ATTR}]`)) {
        button.remove();
      }
    },
  };
}

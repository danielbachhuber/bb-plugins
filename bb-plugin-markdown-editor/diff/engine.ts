// The sync loop: what puts the pencil in bb's diff headers and keeps it there.
//
// This lives outside app.tsx so it can be driven under jsdom. It holds no
// state of its own and talks to no server — the pencil's whole behavior is to
// click a control bb already rendered — so the loop is: find the changes
// panel, find its markdown files, make sure each one has a pencil.
import {
  createPencil,
  existingPencil,
  findHeaders,
  findToolbar,
  undecorate,
  type DiffHeader,
} from "./header";
import { isEditablePath } from "./extensions";

export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  /** The document to decorate. */
  doc: Document;
  /** Defer a pass. Returns a cancel function. `requestAnimationFrame` in bb. */
  defer: (run: () => void) => () => void;
  /** Where failures go. */
  warn: (cause: unknown) => void;
}

export interface Engine {
  /** Run a pass now, skipping the scheduler. Tests use this. */
  syncNow: () => void;
  /** Ask for a pass on the next frame. */
  schedule: () => void;
  dispose: () => void;
}

export function startEngine(deps: EngineDeps): Engine {
  const { signal, doc, defer, warn } = deps;
  // True while this engine is writing to the DOM, so the observer driving
  // `schedule` does not treat its own edits as a reason to run again.
  let writing = false;
  let cancel: (() => void) | null = null;

  function schedule(): void {
    if (signal.aborted || cancel !== null) return;
    // A `defer` that runs its callback synchronously would otherwise leave its
    // cancel handle behind and make `cancel !== null` above reject every later
    // pass forever. bb's `requestAnimationFrame` never does that; a test
    // double does, and so might a future scheduler.
    let ran = false;
    const stop = defer(() => {
      ran = true;
      cancel = null;
      syncNow();
    });
    if (!ran) cancel = stop;
  }

  /**
   * Open the file the way bb would.
   *
   * The path control is re-read from the live document rather than captured
   * when the pencil was injected: bb re-renders these headers freely, and a
   * button held from an earlier pass is a node that is no longer in the
   * document, so clicking it does nothing. Clicking bb's own control, rather
   * than reimplementing the intent, is also what keeps this plugin out of the
   * business of resolving environments and hosts — a content script has no
   * `useBbNavigate` to call anyway.
   */
  function open(pencil: HTMLElement): void {
    const header = resolveFromPencil(pencil);
    if (header?.pathButton == null) {
      warn(new Error("No path control to open this file with"));
      return;
    }
    header.pathButton.click();
  }

  /** The live header around one of this plugin's own pencils. */
  function resolveFromPencil(pencil: HTMLElement): DiffHeader | null {
    const iconGroup = pencil.parentElement;
    if (iconGroup === null) return null;
    for (const header of findHeaders(doc)) {
      if (header.iconGroup === iconGroup) return header;
    }
    return null;
  }

  function decorate(headers: readonly DiffHeader[]): void {
    writing = true;
    try {
      for (const header of headers) {
        if (!isEditablePath(header.path)) continue;
        // Nothing to click means nothing to offer: bb renders the path as a
        // plain span when the file has no preview to open.
        if (header.pathButton === null) continue;
        if (existingPencil(header) !== null) continue;
        // The handler is given its own button, not this header object, so the
        // click re-reads the live header instead of a stale snapshot.
        const pencil: HTMLButtonElement = createPencil(header.path, () => {
          open(pencil);
        });
        header.iconGroup.append(pencil);
      }
    } finally {
      writing = false;
    }
  }

  function syncNow(): void {
    if (signal.aborted) return;
    if (findToolbar(doc) === null) {
      writing = true;
      undecorate(doc.body);
      writing = false;
      return;
    }
    decorate(findHeaders(doc));
  }

  // bb re-renders constantly, so the decoration is re-applied from whatever
  // the DOM currently says rather than assumed to survive. Passes are deferred
  // and coalesced, and edits this engine makes itself are skipped.
  const observer = new doc.defaultView!.MutationObserver(() => {
    if (writing) return;
    schedule();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "title"],
  });

  schedule();

  return {
    syncNow,
    schedule,
    dispose() {
      observer.disconnect();
      if (cancel !== null) cancel();
      cancel = null;
      writing = true;
      undecorate(doc.body);
      writing = false;
    },
  };
}

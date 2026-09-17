// The sync loop: what opens the files bb folded away.
//
// This lives outside app.tsx so it can be driven under jsdom, the same split
// the other hack uses and for the same reason: the wiring is where the bugs go.
import { findCards } from "./cards";
import { cardsToExpand, expansionKey } from "./rules";

export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  /** The document holding bb's diff cards. */
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

export function startEngine(deps: EngineDeps): Engine {
  const { signal, doc, defer } = deps;

  /**
   * Cards this engine has already opened, by path and stats. It is why a file
   * you collapse by hand stays collapsed: each card is opened at most once.
   */
  const expanded = new Set<string>();
  // True while this engine is clicking, so the observer does not treat its own
  // edits as a reason to run again.
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
    const cards = findCards(doc);
    const toExpand = cardsToExpand(cards, expanded);
    if (toExpand.length === 0) return;

    writing = true;
    try {
      for (const card of toExpand) {
        expanded.add(expansionKey(card));
        card.toggle.click();
      }
    } finally {
      writing = false;
    }
    // Opening a card re-renders the panel, and diff-viewed re-collapses any
    // file it had already marked read; both land on a later pass.
    schedule();
  }

  const observer = new doc.defaultView!.MutationObserver(() => {
    if (writing) return;
    schedule();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "aria-label", "data-diff-viewed"],
  });

  schedule();

  return {
    syncNow,
    schedule,
    dispose() {
      observer.disconnect();
      if (cancel !== null) cancel();
      cancel = null;
    },
  };
}

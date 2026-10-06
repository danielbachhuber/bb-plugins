// The sync loop: what opens the files bb folded away.
//
// This lives outside app.tsx so it can be driven under jsdom, the same split
// the other hack uses and for the same reason: the wiring is where the bugs go.
import {
  COLLAPSE_ALL_LABEL,
  EXPAND_ALL_LABEL,
  findCards,
  readDiffIdentity,
} from "./cards";
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
   * Cards seen open in the current diff, by path and stats, whether this
   * engine opened them or bb did. It is why a file you collapse by hand stays
   * collapsed: a card is opened at most once. It is cleared when the diff
   * changes, because bb folds every card again at that moment.
   */
  const seenOpen = new Set<string>();
  let identity: string | null = null;
  /** True after Collapse all files, until the diff changes or you expand all. */
  let paused = false;
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
    const nextIdentity = readDiffIdentity(doc);
    if (nextIdentity !== identity) {
      identity = nextIdentity;
      seenOpen.clear();
      paused = false;
    }
    const cards = findCards(doc);
    for (const card of cards) {
      if (!card.isCollapsed) seenOpen.add(expansionKey(card));
    }
    if (paused) return;
    const toExpand = cardsToExpand(cards, seenOpen);
    if (toExpand.length === 0) return;

    writing = true;
    try {
      for (const card of toExpand) {
        seenOpen.add(expansionKey(card));
        card.toggle.click();
      }
    } finally {
      writing = false;
    }
    // Opening a card re-renders the panel, and diff-viewed re-collapses any
    // file it had already marked read; both land on a later pass.
    schedule();
  }

  // Capture phase, so the label read is the one the user clicked, before bb
  // re-renders the button with the opposite label.
  function onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof doc.defaultView!.Element)) return;
    const label = target.closest("button")?.getAttribute("aria-label");
    if (label === COLLAPSE_ALL_LABEL) paused = true;
    else if (label === EXPAND_ALL_LABEL) paused = false;
  }
  doc.addEventListener("click", onClick, true);

  const observer = new doc.defaultView!.MutationObserver(() => {
    if (writing) return;
    schedule();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    // The range label can change as a text edit, with no node added.
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "aria-label", "data-diff-viewed"],
  });

  schedule();

  return {
    syncNow,
    schedule,
    dispose() {
      observer.disconnect();
      doc.removeEventListener("click", onClick, true);
      if (cancel !== null) cancel();
      cancel = null;
    },
  };
}

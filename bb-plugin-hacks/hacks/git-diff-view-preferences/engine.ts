// The sync loop: what keeps bb's toolbar agreeing with the stored preferences.
//
// Two jobs, and the split between them is the whole design. Preferences are
// *recorded* from click events, because a click is the only evidence that the
// user chose something. The toolbar is *corrected* from whatever the DOM
// currently says, because bb moves these controls on its own and every such
// move has to be undone rather than believed.
//
// This lives outside app.tsx so it can be driven under jsdom. Its dependencies
// are parameters for that reason — the version of this loop that shipped inside
// another plugin had every one of its bugs here, in the wiring, not in the pure
// functions underneath it.
import {
  clicksToApply,
  sameState,
  stateAfter,
  withIntent,
  type ToolbarPrefs,
  type ToolbarState,
} from "./prefs";
import { applyClicks, findToolbar, intentFromClick, readToolbar } from "./toolbar";
import type { PrefsStore } from "./storage";

/**
 * How many times one toolbar mount may be corrected before the hack gives up
 * on it. bb only overrides on a breakpoint crossing, so a handful is generous;
 * the cap exists so that a future bb which fights back cannot spin the loop.
 */
const MAX_CORRECTIONS_PER_TOOLBAR = 20;

export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  /** The document holding bb's toolbar. */
  doc: Document;
  store: PrefsStore;
  /**
   * Whether the viewport is phone-width. bb's compact drawer defaults to
   * stacked and is a different reading situation, so a compact window neither
   * applies the stored preferences nor overwrites them — which is what keeps a
   * desktop `split` off a phone and a phone's choice out of the desktop's.
   */
  isCompactViewport: () => boolean;
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
  const { signal, doc, store, isCompactViewport, defer } = deps;

  let prefs: ToolbarPrefs = store.read();
  let watchedToolbar: Element | null = null;
  let corrections = 0;
  /**
   * Where a correction should land, and how many passes it may take to get
   * there. React re-renders after the click, so a pass that runs in between
   * still reads the old value, and clicking again on that reading would toggle
   * wrap straight back. The grace is deliberately one pass: any longer and a
   * fresh override from bb would be mistaken for a render still in flight.
   */
  let awaiting: { to: ToolbarState; grace: number } | null = null;
  // True while this engine is clicking, so neither the observer nor the click
  // listener treats its own edits as the user's doing.
  let writing = false;
  let cancel: (() => void) | null = null;

  function schedule(): void {
    if (signal.aborted || cancel !== null) return;
    cancel = defer(() => {
      cancel = null;
      syncNow();
    });
  }

  /** A toolbar not seen before is a fresh mount of bb's own state. */
  function onToolbar(toolbar: Element | null): void {
    if (toolbar === watchedToolbar) return;
    watchedToolbar = toolbar;
    corrections = 0;
    awaiting = null;
  }

  /**
   * Bring the toolbar to the stored preferences.
   *
   * Correcting has to happen by clicking bb's own buttons rather than by
   * setting anything: the state lives in React, and the click is also what
   * tells bb that its width-driven default no longer applies.
   */
  function syncNow(): void {
    if (signal.aborted) return;
    const toolbar = findToolbar(doc);
    onToolbar(toolbar);
    if (toolbar === null || isCompactViewport()) return;

    const current = readToolbar(toolbar);
    if (awaiting !== null) {
      if (sameState(current, awaiting.to)) {
        awaiting = null;
      } else if (awaiting.grace > 0) {
        awaiting.grace -= 1;
        return;
      } else {
        awaiting = null;
      }
    }

    const clicks = clicksToApply(prefs, current);
    if (clicks.length === 0) return;
    if (corrections >= MAX_CORRECTIONS_PER_TOOLBAR) return;
    corrections += 1;
    const to = stateAfter(current, clicks);
    writing = true;
    try {
      applyClicks(toolbar, clicks);
    } finally {
      writing = false;
    }
    // bb may have re-rendered synchronously, in which case there is nothing to
    // wait for and the next override can be corrected immediately.
    if (sameState(readToolbar(toolbar), to)) {
      awaiting = null;
      return;
    }
    awaiting = { to, grace: 1 };
    schedule();
  }

  /**
   * Record what the user asked for. This is the only thing that writes a
   * preference: an observed change cannot be told apart from bb moving the
   * control itself, and treating one as the other is what let bb's
   * width-driven default overwrite a stored choice.
   */
  function onClick(event: Event): void {
    if (writing || signal.aborted || isCompactViewport()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toolbar = findToolbar(doc);
    if (toolbar === null) return;
    const intent = intentFromClick(toolbar, target);
    if (intent === null) return;
    const next = withIntent(prefs, intent);
    if (next === prefs) return;
    prefs = next;
    corrections = 0;
    awaiting = null;
    store.write(next);
  }

  // Capture phase, on the document: bb replaces these buttons as it re-renders,
  // so a listener bound to a button would go stale.
  doc.addEventListener("click", onClick, true);

  /**
   * Another window changed a preference. Re-reading and correcting makes the
   * last choice anywhere the one that holds, which is how bb's own
   * `atomWithStorage` behaves across tabs.
   */
  const unsubscribe = store.subscribe(() => {
    if (signal.aborted) return;
    prefs = store.read();
    corrections = 0;
    awaiting = null;
    schedule();
  });

  // bb re-renders constantly, so the toolbar is re-read from whatever the DOM
  // currently says rather than assumed to hold still. Passes are deferred and
  // coalesced, and edits this engine makes itself are skipped.
  const observer = new doc.defaultView!.MutationObserver(() => {
    if (writing) return;
    schedule();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "aria-pressed"],
  });

  schedule();

  return {
    syncNow,
    schedule,
    dispose() {
      observer.disconnect();
      doc.removeEventListener("click", onClick, true);
      unsubscribe();
      if (cancel !== null) cancel();
      cancel = null;
    },
  };
}

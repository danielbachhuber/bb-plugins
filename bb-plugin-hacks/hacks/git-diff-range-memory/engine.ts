// The sync loop: what puts a thread's range back when you return to it.
//
// A range is *recorded* only from a click in bb's dropdown, because bb moves
// the range on its own: it clears it on every thread switch, when the
// selected range stops existing, and when a file link in the transcript asks
// the panel to scroll to a file. None of those is a choice.
//
// A range is *restored* once per arrival, meaning a switch to a thread or a
// fresh mount of the dropdown, and then left alone. Enforcing it for as long
// as the thread is open would undo bb's own moves, such as the file link.
import { optionForText, restoreDecision, SETTLE_MS } from "./rules";
import { clickedMenuItem, findTrigger, readSelectorProps } from "./selector";
import type { RangeStore } from "./storage";

/**
 * How many times one arrival may select the stored range. bb accepts the
 * first one once the range has loaded, so the cap exists only so that a
 * future bb which rejects it cannot spin the loop.
 */
const MAX_APPLIES_PER_ARRIVAL = 5;

export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  /** The document holding bb's changes panel. */
  doc: Document;
  store: RangeStore;
  /** The thread on screen, or null when no thread is. */
  threadId: () => string | null;
  now: () => number;
  /** Defer a pass. Returns a cancel function. `requestAnimationFrame` in bb. */
  defer: (run: () => void) => () => void;
  /** Run a pass after `ms`. Returns a cancel function. `setTimeout` in bb. */
  after: (ms: number, run: () => void) => () => void;
}

export interface Engine {
  /** Run a pass now, skipping the scheduler. Tests use this. */
  syncNow: () => void;
  /** Ask for a pass on the next frame. */
  schedule: () => void;
  dispose: () => void;
}

interface Arrival {
  threadId: string;
  trigger: Element;
  at: number;
  /** Whether this arrival still has a stored range to put back. */
  pending: boolean;
  applies: number;
}

export function startEngine(deps: EngineDeps): Engine {
  const { signal, doc, store, threadId, now, defer, after } = deps;

  let arrival: Arrival | null = null;
  let cancelFrame: (() => void) | null = null;
  let cancelTimer: (() => void) | null = null;

  function schedule(): void {
    if (signal.aborted || cancelFrame !== null) return;
    cancelFrame = defer(() => {
      cancelFrame = null;
      syncNow();
    });
  }

  function syncNow(): void {
    if (signal.aborted) return;
    const thread = threadId();
    const trigger = findTrigger(doc);
    if (thread === null || trigger === null) {
      arrival = null;
      return;
    }

    if (arrival?.threadId !== thread || arrival.trigger !== trigger) {
      arrival = {
        threadId: thread,
        trigger,
        at: now(),
        pending: store.get(thread) !== undefined,
        applies: 0,
      };
      if (arrival.pending) {
        // A matching range is trusted only after the settle window, and
        // nothing in the DOM need change to mark the end of it.
        if (cancelTimer !== null) cancelTimer();
        cancelTimer = after(SETTLE_MS + 50, () => {
          cancelTimer = null;
          schedule();
        });
      }
    }
    if (!arrival.pending) return;

    const stored = store.get(thread);
    const props = readSelectorProps(trigger);
    if (stored === undefined || props === null) return;

    const decision = restoreDecision({
      stored,
      value: props.value,
      options: props.options,
      sinceArrivalMs: now() - arrival.at,
    });
    switch (decision.kind) {
      case "done":
      case "give-up":
        arrival.pending = false;
        return;
      case "wait":
        return;
      case "apply":
        if (arrival.applies >= MAX_APPLIES_PER_ARRIVAL) {
          arrival.pending = false;
          return;
        }
        arrival.applies += 1;
        props.onChange(stored);
        return;
    }
  }

  /**
   * Record what the user picked. This is the only thing that writes a range,
   * and it ends the arrival's restore, so a range picked while the stored one
   * was still loading is not overruled when it loads.
   */
  function onClick(event: Event): void {
    if (signal.aborted) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const thread = threadId();
    const trigger = findTrigger(doc);
    if (thread === null || trigger === null) return;
    const item = clickedMenuItem(doc, trigger, target);
    if (item === null) return;
    const props = readSelectorProps(trigger);
    if (props === null) return;
    // Items another plugin adds to the menu, such as Diff Viewed's Only
    // unviewed, name no range and are ignored here.
    const option = optionForText(props.options, item.textContent ?? "");
    if (option === undefined) return;
    store.set(thread, option.value);
    if (arrival !== null) arrival.pending = false;
  }

  // Capture phase, on the document: the menu is portaled and re-rendered, so
  // a listener bound to an item would go stale.
  doc.addEventListener("click", onClick, true);

  // A thread switch re-renders the panel, so a mutation is the signal for
  // both arrivals and loaded ranges. Passes are deferred and coalesced.
  const observer = new doc.defaultView!.MutationObserver(() => {
    schedule();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  schedule();

  return {
    syncNow,
    schedule,
    dispose() {
      observer.disconnect();
      doc.removeEventListener("click", onClick, true);
      if (cancelFrame !== null) cancelFrame();
      if (cancelTimer !== null) cancelTimer();
      cancelFrame = null;
      cancelTimer = null;
    },
  };
}

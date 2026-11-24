// The sync loop: what turns on line wrap for diff, markdown, plain-text, and
// unlabeled code blocks in chat.
//
// bb renders each fenced code block in a message with a language label, a
// wrap toggle, and a copy button. The wrap state lives in React and starts
// off, so the only way to change it is to click bb's own toggle.
export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  /** The document holding bb's chat messages. */
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

/**
 * The languages whose blocks start wrapped. The empty string is a block with
 * no language, which bb renders with an empty label.
 */
const WRAPPED_LANGUAGES = new Set([
  "diff",
  "markdown",
  "md",
  "text",
  "txt",
  "plaintext",
  "",
]);

const TOGGLE_SELECTOR = 'button[aria-label="Wrap lines"][aria-pressed="false"]';

/**
 * The language label in the toggle's code-block header, lowercased, or null
 * when the toggle has no label beside it and so is not a chat code block.
 */
export function blockLanguage(toggle: Element): string | null {
  const header = toggle.parentElement?.parentElement;
  const label = header?.querySelector(":scope > span");
  if (!label) return null;
  return (label.textContent ?? "").trim().toLowerCase();
}

export function startEngine(deps: EngineDeps): Engine {
  const { signal, doc, defer } = deps;

  /**
   * Toggles this engine has already clicked. It is why a block you unwrap by
   * hand stays unwrapped: each toggle is clicked at most once. A block that
   * remounts gets a new button, and so starts wrapped again.
   */
  const clicked = new WeakSet<Element>();
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
    writing = true;
    try {
      for (const toggle of doc.querySelectorAll<HTMLButtonElement>(
        TOGGLE_SELECTOR,
      )) {
        if (clicked.has(toggle)) continue;
        const language = blockLanguage(toggle);
        if (language === null || !WRAPPED_LANGUAGES.has(language)) continue;
        clicked.add(toggle);
        toggle.click();
      }
    } finally {
      writing = false;
    }
  }

  const observer = new doc.defaultView!.MutationObserver(() => {
    if (writing) return;
    schedule();
  });
  observer.observe(doc.body, { childList: true, subtree: true });

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

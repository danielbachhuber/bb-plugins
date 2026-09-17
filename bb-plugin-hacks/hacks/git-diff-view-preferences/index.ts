// The hack, as the content-script registration bb mounts.
//
// One file per hack means app.tsx never grows a reason to know how any of them
// work; it hands each one the real window and gets a disposer back.
import { startEngine } from "./engine";
import { createLocalStoragePrefsStore } from "./storage";

/** Matches bb's own `useIsCompactViewport()`. */
const COMPACT_VIEWPORT_QUERY = "(max-width: 767px)";

export const id = "git-diff-view-preferences";

export function mount(signal: AbortSignal): () => void {
  const compact = window.matchMedia(COMPACT_VIEWPORT_QUERY);
  const engine = startEngine({
    signal,
    doc: document,
    store: createLocalStoragePrefsStore(window),
    isCompactViewport: () => compact.matches,
    defer: (run) => {
      const frame = window.requestAnimationFrame(run);
      return () => window.cancelAnimationFrame(frame);
    },
  });

  // Crossing the breakpoint changes whether the preferences apply at all, and
  // bb re-renders the drawer without necessarily touching an `aria-pressed`
  // the observer would see.
  const onViewportChange = () => {
    engine.schedule();
  };
  compact.addEventListener("change", onViewportChange);

  return () => {
    compact.removeEventListener("change", onViewportChange);
    engine.dispose();
  };
}

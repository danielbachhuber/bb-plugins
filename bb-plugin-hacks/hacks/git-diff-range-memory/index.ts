// The hack, as the content-script registration bb mounts.
import { startEngine } from "./engine";
import { createLocalStorageRangeStore } from "./storage";

export const id = "git-diff-range-memory";

/** bb's thread routes are `/threads/<id>`, under any prefix. */
function threadIdFromPath(pathname: string): string | null {
  return /\/threads\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

export function mount(signal: AbortSignal): () => void {
  const engine = startEngine({
    signal,
    doc: document,
    store: createLocalStorageRangeStore(window),
    threadId: () => threadIdFromPath(window.location.pathname),
    now: () => Date.now(),
    defer: (run) => {
      const frame = window.requestAnimationFrame(run);
      return () => window.cancelAnimationFrame(frame);
    },
    after: (ms, run) => {
      const timer = window.setTimeout(run, ms);
      return () => window.clearTimeout(timer);
    },
  });

  return () => {
    engine.dispose();
  };
}

// The hack, as the content-script registration bb mounts.
import { startEngine } from "./engine";

export const id = "git-diff-expand-unviewed";

export function mount(signal: AbortSignal): () => void {
  const engine = startEngine({
    signal,
    doc: document,
    defer: (run) => {
      const frame = window.requestAnimationFrame(run);
      return () => window.cancelAnimationFrame(frame);
    },
  });

  return () => {
    engine.dispose();
  };
}

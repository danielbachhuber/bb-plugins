// The hack, as the content-script registration bb mounts.
import { startEngine } from "./engine";

export const id = "plugins-mine-tab";

export function mount(signal: AbortSignal): () => void {
  const engine = startEngine({
    signal,
    doc: document,
    defer: (run) => {
      const frame = window.requestAnimationFrame(run);
      return () => window.cancelAnimationFrame(frame);
    },
    async loadShelfEnabled() {
      const response = await window.fetch(`${window.location.origin}/api/v1/plugins`);
      if (!response.ok) return false;
      const { plugins } = (await response.json()) as {
        plugins: { id: string; enabled: boolean }[];
      };
      return plugins.some((plugin) => plugin.id === "plugin-shelf" && plugin.enabled);
    },
    // bb uses a browser router, which listens for popstate. Pushing the path
    // and announcing it keeps the navigation in-app, without a reload.
    navigate(path) {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    warn: (message, error) => {
      console.warn(`[hacks:${id}] ${message}`, error);
    },
  });
  return () => engine.dispose();
}

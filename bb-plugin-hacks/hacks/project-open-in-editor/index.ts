// The hack, as the content-script registration bb mounts.
import {
  findDaemon,
  listOpenTargets,
  listProjects,
  openInTarget,
  PREFERRED_TARGET_KEY,
  type Daemon,
} from "./api";
import { startEngine } from "./engine";

export const id = "project-open-in-editor";

export function mount(signal: AbortSignal): () => void {
  const origin = window.location.origin;
  const fetchFn = window.fetch.bind(window);
  let daemon: Daemon | null = null;

  const engine = startEngine({
    signal,
    doc: document,
    defer: (run) => {
      const frame = window.requestAnimationFrame(run);
      return () => window.cancelAnimationFrame(frame);
    },
    async loadMachine() {
      daemon = await findDaemon(fetchFn, origin);
      if (daemon === null) return null;
      return {
        hostId: daemon.hostId,
        targets: await listOpenTargets(fetchFn, daemon),
      };
    },
    loadProjects: () => listProjects(fetchFn, origin),
    readPreferredTarget: () => window.localStorage.getItem(PREFERRED_TARGET_KEY),
    async open(path, targetId) {
      if (daemon === null) return;
      await openInTarget(fetchFn, daemon, path, targetId);
    },
    warn: (message, error) => {
      console.warn(`[hacks:${id}] ${message}`, error);
    },
  });

  return () => {
    engine.dispose();
  };
}

// The hack, as the content-script registration bb mounts.
import type { ProjectCheckout } from "./rules";
import { startEngine } from "./engine";

export const id = "checkout-sync";

const PLUGIN_ID = "hacks";

/** Calls this plugin's own RPC, the same request `useRpc` makes. */
async function call<Result>(method: string, input: unknown): Promise<Result> {
  const response = await fetch(`/api/v1/plugins/${PLUGIN_ID}/rpc/${method}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; result?: Result } | null;
  if (!response.ok || body?.ok !== true || body.result === undefined) {
    throw new Error(`${method} failed (${response.status})`);
  }
  return body.result;
}

export function mount(signal: AbortSignal): () => void {
  const engine = startEngine({
    signal,
    doc: document,
    defer: (run) => {
      const frame = window.requestAnimationFrame(run);
      return () => window.cancelAnimationFrame(frame);
    },
    wait: (run, ms) => {
      const timer = window.setTimeout(run, ms);
      return () => window.clearTimeout(timer);
    },
    hidden: () => document.visibilityState === "hidden",
    loadStatus: (projectIds) =>
      call<Record<string, ProjectCheckout>>("checkout_status", { projectIds }),
    pull: (projectId) => call<ProjectCheckout>("checkout_pull", { projectId }),
    warn: (message, error) => {
      console.warn(`[hacks:${id}] ${message}`, error);
    },
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") engine.wake();
  };
  document.addEventListener("visibilitychange", onVisible, { signal });

  return () => {
    engine.dispose();
  };
}

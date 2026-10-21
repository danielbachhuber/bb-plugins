import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { definePluginApp, useBbNavigate, useComposer, useRpc } from "@get-bb/plugin-sdk/app";
import { ServicesStrip, targetKey } from "./components/services-strip";
import type { Failure, RunTarget, Strip, rpcContract } from "./services/contract";

declare const __BB_PLUGIN_ID__: string | undefined;

/** How often status runs while the thread is on screen. */
const POLL_INTERVAL_MS = 5_000;
/** After a button, services take a moment to come up or go down; watch closely. */
const FAST_POLL_INTERVAL_MS = 1_000;
const FAST_POLL_DURATION_MS = 15_000;

/**
 * bb has no slot under the composer, so the bar is mounted from a banner
 * slot, which carries the thread's context, and drawn into a container this
 * appends to the thread pane's sticky footer, under the composer and as wide
 * as the pane. If bb renames the footer marker the bar falls back to the
 * composer's own column, and without either it does not appear.
 */
function useContainerUnderComposer(): [(element: HTMLSpanElement | null) => void, HTMLElement | null] {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const ref = useCallback((probe: HTMLSpanElement | null) => {
    const shell = probe?.closest("[data-scroll-footer]") ?? probe?.closest("[data-promptbox-shell]");
    if (!shell) return setContainer(null);
    const element = document.createElement("div");
    element.dataset.devBarStrip = "";
    // The plugin's stylesheet applies only inside its own root, and this container sits in bb's footer.
    element.dataset.bbPluginRoot = "";
    element.dataset.bbPlugin = typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : "dev-bar";
    shell.appendChild(element);
    setContainer(element);
  }, []);
  useEffect(() => () => container?.remove(), [container]);
  return [ref, container];
}

/** Each thread's last strip, so returning to a thread shows it straight away. */
const lastStrip = new Map<string, Strip>();

function Strip() {
  const composer = useComposer();
  const threadId = composer.scope.kind === "thread" ? composer.scope.threadId : null;
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [probeRef, container] = useContainerUnderComposer();
  const [strip, setStrip] = useState<Strip | null>(() => (threadId ? (lastStrip.get(threadId) ?? null) : null));
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [actionFailure, setActionFailure] = useState<Failure | null>(null);
  const [dismissedStatus, setDismissedStatus] = useState<string | null>(null);
  const [fastUntil, setFastUntil] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const currentThreadId = useRef(threadId);
  currentThreadId.current = threadId;

  useEffect(() => {
    setStrip(threadId ? (lastStrip.get(threadId) ?? null) : null);
    setActionFailure(null);
  }, [threadId]);

  const load = useCallback(async () => {
    if (!threadId || document.visibilityState === "hidden") return;
    try {
      const next = await rpc.call("strip", { threadId });
      lastStrip.set(threadId, next);
      if (currentThreadId.current === threadId) setStrip(next);
    } catch {
      // Keep what is on screen; the next poll tries again.
    }
  }, [rpc, threadId]);

  useEffect(() => {
    void load();
    const fast = Date.now() < fastUntil;
    const timer = setInterval(() => {
      if (fast && Date.now() >= fastUntil) setFastUntil(0);
      void load();
    }, fast ? FAST_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, fastUntil]);

  const run = useCallback(
    async (target: RunTarget) => {
      if (!threadId) return;
      const key = targetKey(target);
      setBusy((previous) => new Set(previous).add(key));
      setActionFailure(null);
      try {
        const { failure } = await rpc.call("run", { threadId, target });
        setActionFailure(failure);
      } catch (error) {
        setActionFailure({ title: "Command", command: "", output: error instanceof Error ? error.message : String(error) });
      } finally {
        setBusy((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
        setFastUntil(Date.now() + FAST_POLL_DURATION_MS);
      }
    },
    [rpc, threadId],
  );

  const startThread = useCallback(
    async (shown: Failure) => {
      if (!threadId) return;
      try {
        const started = await rpc.call("startThread", { threadId, failure: shown });
        navigate.toThread(started.threadId);
      } catch (error) {
        setActionFailure({
          title: "Start thread",
          command: "",
          output: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [navigate, rpc, threadId],
  );

  const probe = <span ref={probeRef} hidden />;
  if (!threadId || !container || strip?.kind === "none") return probe;

  const services = strip?.kind === "services" ? strip : null;
  const statusFailure = services?.failure ?? null;
  const statusKey = statusFailure ? `${statusFailure.command}\n${statusFailure.output}` : null;
  const failure = actionFailure ?? (statusKey !== dismissedStatus ? statusFailure : null);

  return (
    <>
      {probe}
      {createPortal(
        <ServicesStrip
          services={services?.services ?? []}
          actions={services?.actions ?? []}
          loaded={strip !== null}
          source={services?.source ?? null}
          busy={busy}
          failure={failure}
          onRun={(target) => void run(target)}
          onOpen={(url) => navigate.openUrl(url)}
          onDismissFailure={() => (actionFailure ? setActionFailure(null) : setDismissedStatus(statusKey))}
          onStartThread={(shown) => void startThread(shown)}
          retrying={retrying}
          onRetry={() => {
            // A failure that persists shows its note again, even if it was dismissed.
            setDismissedStatus(null);
            setRetrying(true);
            void load().finally(() => setRetrying(false));
          }}
        />,
        container,
      )}
    </>
  );
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "dev-bar",
    scopes: ["thread"],
    banners: [{ id: "strip", chrome: "bare", component: Strip }],
  });
});

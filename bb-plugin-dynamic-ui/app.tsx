// bb-plugin-dynamic-ui — the view tab, and the header button that opens it.
//
// A view shows in a tab in the side panel of the thread that published it.
// The header button appears only in threads that have a view, and it opens
// the tab by itself when a new view is published, so the user sees the
// results without looking for them.
import { useCallback, useEffect, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRealtime,
  useRpc,
  type PluginThreadHeaderActionProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import type { StoredView } from "./view/store.js";
import { ViewPanel } from "./view/view-panel.js";

const PANEL_ACTION = "view";

function viewIdFrom(params: unknown): number | null {
  if (typeof params !== "object" || params === null) return null;
  const value = (params as { viewId?: unknown }).viewId;
  return typeof value === "number" ? value : null;
}

function ViewTab({ threadId, params }: PluginThreadPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [stored, setStored] = useState<StoredView | null | undefined>(undefined);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const wanted = viewIdFrom(params);

  const fail = useCallback((error: unknown) => {
    toast.error(error instanceof Error ? error.message : String(error));
  }, []);

  const refetch = useCallback(() => {
    // Opened from the launcher without params: the thread's newest view.
    const load =
      wanted === null
        ? rpc.call("thread_views", { threadId }).then(({ views }) => views[0] ?? null)
        : rpc.call("view_get", { viewId: wanted });
    load.then(setStored, fail);
  }, [rpc, threadId, wanted, fail]);
  useEffect(refetch, [refetch]);
  const onSignal = useCallback(
    (payload: unknown) => {
      if ((payload as { threadId?: string } | null)?.threadId === threadId) refetch();
    },
    [threadId, refetch],
  );
  useRealtime("dynamic-ui-changed", onSignal);
  useRealtime("dynamic-ui-published", onSignal);

  if (stored === undefined) return null;
  if (stored === null) {
    return <div className="px-4 py-6 text-sm text-muted-foreground">This thread has not published a view.</div>;
  }

  return (
    <ViewPanel
      stored={stored}
      busyItem={busyItem}
      onGoToThread={(id) => navigate.toThread(id)}
      onRun={(item, index) => {
        setBusyItem(item.id);
        rpc
          .call("action_run", { viewId: stored.id, itemId: item.id, index })
          .then((updated) => {
            setStored(updated);
            const result = updated.items[item.id]?.result;
            if (result?.error !== undefined) toast.error(result.error);
          }, fail)
          .finally(() => setBusyItem(null));
      }}
      onDismiss={(item, dismissed) => {
        setBusyItem(item.id);
        rpc
          .call("item_dismiss", { viewId: stored.id, itemId: item.id, dismissed })
          .then(setStored, fail)
          .finally(() => setBusyItem(null));
      }}
    />
  );
}

function HeaderButton({ threadId }: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [views, setViews] = useState<StoredView[]>([]);

  const refetch = useCallback(() => {
    rpc.call("thread_views", { threadId }).then(({ views }) => setViews(views), () => undefined);
  }, [rpc, threadId]);
  useEffect(refetch, [refetch]);

  const open = useCallback(
    (viewId: number, title: string) => navigate.openThreadPanel({ actionId: PANEL_ACTION, params: { viewId }, title }),
    [navigate],
  );

  useRealtime(
    "dynamic-ui-published",
    useCallback(
      (payload: unknown) => {
        const signal = payload as { threadId?: string; viewId?: number; title?: string } | null;
        if (signal?.threadId !== threadId || typeof signal.viewId !== "number") return;
        refetch();
        open(signal.viewId, signal.title ?? "View");
      },
      [threadId, refetch, open],
    ),
  );

  const [latest] = views;
  if (latest === undefined) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs"
      aria-label={`Open ${latest.view.title}`}
      onClick={() => open(latest.id, latest.view.title)}
    >
      {views.length === 1 ? "View" : `Views (${views.length})`}
    </Button>
  );
}

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: PANEL_ACTION,
    title: "Dynamic UI view",
    layout: "flush",
    component: ViewTab,
  });
  app.slots.experimental_threadHeaderAction({
    id: "open-view",
    title: "Dynamic UI",
    component: HeaderButton,
  });
});

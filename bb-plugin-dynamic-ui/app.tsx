// bb-plugin-dynamic-ui — a thread's view, above its composer and in its side
// panel.
//
// The newest view a thread published shows as a compact list right above the
// composer: one row per item with a Review button. Clicking a row opens that
// item in the side panel, with its details and every button. The panel keeps
// one tab per view and switches the item it shows as rows are clicked.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useComposerView,
  useRealtime,
  useRpc,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { allHandled, ViewBanner } from "./view/banner.js";
import { alreadyAutoOpened, markAutoOpened, publishStamp } from "./view/auto-open.js";
import { focusOf, setFocus, useFocus } from "./view/focus.js";
import type { Item } from "./view/schema.js";
import type { StoredView } from "./view/store.js";
import { firstOpenItem, nextOpenItem, ViewPanel } from "./view/view-panel.js";
import { StartThreadDialog, type ThreadSeed } from "./view/start-thread-dialog.js";

const PANEL_ACTION = "view";

function viewIdFrom(params: unknown): number | null {
  if (typeof params !== "object" || params === null) return null;
  const value = (params as { viewId?: unknown }).viewId;
  return typeof value === "number" ? value : null;
}

function useFail() {
  return useCallback((error: unknown) => {
    toast.error(error instanceof Error ? error.message : String(error));
  }, []);
}

/** Refetches whenever the server says something in this thread's views changed. */
function useThreadSignal(threadId: string | null, refetch: () => void) {
  const onSignal = useCallback(
    (payload: unknown) => {
      if (threadId !== null && (payload as { threadId?: string } | null)?.threadId === threadId) refetch();
    },
    [threadId, refetch],
  );
  useRealtime("dynamic-ui-changed", onSignal);
  useRealtime("dynamic-ui-published", onSignal);
}

/** Runs one of an item's actions and reports a failure it records. */
function useRunAction(setStored: (view: StoredView) => void) {
  const rpc = useRpc<typeof rpcContract>();
  const fail = useFail();
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const run = useCallback(
    (stored: StoredView, item: Item, index: number, draft?: string) => {
      setBusyItem(item.id);
      rpc
        .call("action_run", { viewId: stored.id, itemId: item.id, index, ...(draft === undefined ? {} : { draft }) })
        .then((updated) => {
          setStored(updated);
          const result = updated.items[item.id]?.result;
          if (result?.error !== undefined) toast.error(result.error);
        }, fail)
        .finally(() => setBusyItem(null));
    },
    [rpc, fail, setStored],
  );
  return { busyItem, setBusyItem, run };
}

/**
 * A visual review's images, fetched once per view and item as the panel shows
 * them. Keyed by publish time too, so a republish with new images refetches.
 */
function useReviewImages(stored: StoredView | null | undefined, itemId: string | null) {
  const rpc = useRpc<typeof rpcContract>();
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const item =
    stored && itemId ? stored.view.sections.flatMap((section) => section.items).find((candidate) => candidate.id === itemId) : undefined;
  const prefix = stored && item ? `${stored.id}@${stored.publishedAt}:${item.id}:` : null;
  const count = item?.variations.length ?? 0;
  useEffect(() => {
    if (!stored || !item || prefix === null) return;
    item.variations.forEach((_, index) => {
      const key = prefix + index;
      rpc.call("image_get", { viewId: stored.id, itemId: item.id, index }).then(
        ({ dataUrl }) => setUrls((current) => (key in current ? current : { ...current, [key]: dataUrl })),
        () => setUrls((current) => ({ ...current, [key]: null })),
      );
    });
    // The prefix names the view, its publish, and the item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, prefix, count]);
  return useCallback(
    (forItem: string, index: number) => (prefix !== null && forItem === itemId ? urls[prefix + index] : undefined),
    [urls, prefix, itemId],
  );
}

function ViewTab({ threadId, params }: PluginThreadPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const fail = useFail();
  const focus = useFocus(threadId);
  const [stored, setStored] = useState<StoredView | null | undefined>(undefined);
  const { busyItem, setBusyItem, run } = useRunAction(setStored);
  const wanted = viewIdFrom(params) ?? focus?.viewId ?? null;

  const refetch = useCallback(() => {
    // Opened from the launcher without params: the thread's newest view.
    const load =
      wanted === null
        ? rpc.call("thread_views", { threadId }).then(({ views }) => views[0] ?? null)
        : rpc.call("view_get", { viewId: wanted });
    load.then(setStored, fail);
  }, [rpc, threadId, wanted, fail]);
  useEffect(refetch, [refetch]);
  useThreadSignal(threadId, refetch);

  const focusHere = stored && focus?.viewId === stored.id ? focus : undefined;
  const shownItem = focusHere?.itemId ?? (stored ? (firstOpenItem(stored)?.id ?? null) : null);
  const imageUrl = useReviewImages(stored, shownItem);
  // The item whose new-thread composer is open, with what it starts with.
  const [starting, setStarting] = useState<{ item: Item; seed: ThreadSeed } | null>(null);

  if (stored === undefined) return null;
  if (stored === null) {
    return <div className="px-4 py-6 text-sm text-muted-foreground">This thread has not published a view.</div>;
  }

  return (
    <>
      <ViewPanel
        stored={stored}
        busyItem={busyItem}
        focusItemId={focusHere?.itemId ?? null}
        confirming={
          focusHere?.itemId && focusHere.confirmIndex !== undefined ? `${focusHere.itemId}:${focusHere.confirmIndex}` : undefined
        }
        onGoToThread={(id) => navigate.toThread(id)}
        imageUrl={imageUrl}
        onSubmitReview={(item, feedback) => {
          setBusyItem(item.id);
          rpc
            .call("review_submit", { viewId: stored.id, itemId: item.id, ...feedback })
            .then((updated) => {
              setStored(updated);
              const result = updated.items[item.id]?.result;
              if (result?.error !== undefined) toast.error(result.error);
            }, fail)
            .finally(() => setBusyItem(null));
        }}
        onRun={(item, index, draft) => run(stored, item, index, draft)}
        onDismiss={(item, dismissed) => {
          setBusyItem(item.id);
          rpc
            .call("item_dismiss", { viewId: stored.id, itemId: item.id, dismissed })
            .then((updated) => {
              setStored(updated);
              // Dismissing moves on to the next open item; undoing stays put.
              const next = dismissed ? nextOpenItem(updated, item.id) : null;
              if (next) setFocus(threadId, { viewId: updated.id, itemId: next.id });
            }, fail)
            .finally(() => setBusyItem(null));
        }}
        onStartThread={(item) => {
          rpc.call("item_thread_seed", { viewId: stored.id, itemId: item.id }).then((seed) => setStarting({ item, seed }), fail);
        }}
      />
      <StartThreadDialog
        title={starting?.item.title ?? ""}
        draftKey={starting ? `dynamic-ui:${stored.id}:${stored.publishedAt}:${starting.item.id}` : ""}
        seed={starting?.seed ?? null}
        onClose={() => setStarting(null)}
        onSubmit={async (request) => {
          if (starting === null) return;
          try {
            const { threadId: started } = await rpc.call("item_thread_start", {
              viewId: stored.id,
              itemId: starting.item.id,
              request: request as never,
            });
            setStarting(null);
            toast.success("Started a thread", { action: { label: "Go to thread", onClick: () => navigate.toThread(started) } });
          } catch (error) {
            fail(error);
            // Thrown so the composer keeps the draft rather than clearing it.
            throw error;
          }
        }}
      />
    </>
  );
}

/**
 * Opens the side panel on a view's first open item, unless the item already
 * picked in it is still open: a republish after the user acts moves on to the
 * next item, but does not pull them away from one they are reading.
 */
function showFirstOpen(threadId: string, stored: StoredView, navigate: ReturnType<typeof useBbNavigate>): boolean {
  const current = focusOf(threadId);
  const keep =
    current?.viewId === stored.id &&
    current.itemId !== null &&
    (stored.items[current.itemId]?.state ?? "open") === "open";
  if (!keep) {
    const first = firstOpenItem(stored);
    if (first === null) return false;
    setFocus(threadId, { viewId: stored.id, itemId: first.id });
  }
  return navigate.openThreadPanel({ actionId: PANEL_ACTION, params: { viewId: stored.id }, title: stored.view.title }) !== false;
}

function Banner() {
  const composer = useComposerView();
  const threadId = composer.scope.kind === "thread" ? composer.scope.threadId : null;
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [stored, setStored] = useState<StoredView | null>(null);
  // Unset, the list collapses by itself once every item is handled; a click on
  // the header overrides that until the next publish.
  const [collapsedByUser, setCollapsedByUser] = useState<boolean | null>(null);
  const focus = useFocus(threadId ?? "");
  // Read through a ref so the fetch below does not re-run whenever the host
  // hands back a new navigate object.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const refetch = useCallback(() => {
    if (threadId === null) return;
    rpc.call("thread_views", { threadId }).then((views) => {
      const view = views.views.find((candidate) => candidate.hiddenAt === null) ?? null;
      setStored(view);
      // The first load after each publish opens the side panel on the first
      // open item, whether the publish happened while the thread was on
      // screen or before it was visited.
      if (view === null) return;
      const stamp = publishStamp(view.id, view.publishedAt);
      if (alreadyAutoOpened(threadId, stamp)) return;
      if (showFirstOpen(threadId, view, navigateRef.current)) markAutoOpened(threadId, stamp);
    }, () => undefined);
  }, [rpc, threadId]);
  useEffect(refetch, [refetch]);
  useThreadSignal(threadId, refetch);
  // A newly published view opens expanded, even if the last one was collapsed.
  useRealtime(
    "dynamic-ui-published",
    useCallback((payload: unknown) => {
      if ((payload as { threadId?: string } | null)?.threadId === threadId) setCollapsedByUser(null);
    }, [threadId]),
  );

  // Rendering nothing lets the host's card hide itself.
  if (threadId === null || stored === null) return null;
  const collapsed = collapsedByUser ?? allHandled(stored);

  const openItem = (item: Item) => {
    setFocus(threadId, { viewId: stored.id, itemId: item.id });
    // Same params as an open tab focuses that tab, which then shows the item.
    navigate.openThreadPanel({ actionId: PANEL_ACTION, params: { viewId: stored.id }, title: stored.view.title });
  };

  return (
    <ViewBanner
      stored={stored}
      collapsed={collapsed}
      onToggle={() => setCollapsedByUser(!collapsed)}
      onHide={() => {
        rpc.call("view_hide", { viewId: stored.id, hidden: true }).then(refetch, (error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
      }}
      busyItem={null}
      focusedItem={(focus?.viewId === stored.id ? focus.itemId : null) ?? firstOpenItem(stored)?.id ?? null}
      onOpenItem={(item) => openItem(item)}
      onGoToThread={(id) => navigate.toThread(id)}
    />
  );
}

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: PANEL_ACTION,
    title: "Dynamic UI view",
    layout: "flush",
    component: ViewTab,
  });
  app.composer.customize({
    id: "view",
    scopes: ["thread"],
    banners: [{ id: "view", component: Banner }],
  });
});

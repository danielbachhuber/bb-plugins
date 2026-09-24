// bb-plugin-now — the Now page: what needs doing now, from every source.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRealtime,
  useRpc,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { SyncStatus } from "@/components/ui/sync-status";

import type { rpcContract } from "./server";
import { SYNC_CHANNEL, type Listing } from "./now/contract.js";
import { ItemListView } from "./now/item-list.js";
import type { RowActions } from "./now/item-row.js";
import { StartThreadDialog, type StartThreadSeed } from "./now/start-thread-dialog.js";
import { itemOrigin, threadPrompt } from "./now/thread-prompt.js";
import type { Item } from "./now/types.js";

/** Opening the page syncs a stored list older than this. */
const STALE_ON_OPEN_MS = 60_000;

/**
 * The stored list, re-read whenever a sync starts or finishes. The header and
 * the page mount separately, so each runs its own copy; both re-read on the
 * same event, so they cannot disagree for long.
 */
function useListing() {
  const rpc = useRpc<typeof rpcContract>();
  const [listing, setListing] = useState<Listing | null>(null);

  const load = useCallback(() => {
    rpc.call("items_list", null).then(setListing, () => undefined);
  }, [rpc]);

  useEffect(load, [load]);
  useRealtime(SYNC_CHANNEL, load);

  return { listing, rpc };
}

/** When the list last synced, and the Refresh button, in the page's title bar. */
function SyncHeader() {
  const { listing, rpc } = useListing();
  const [busy, setBusy] = useState(false);

  const onRefresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await rpc.call("items_sync", null);
      if (result.error !== null) toast.error(result.error);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [rpc]);

  const fetchedAt = listing?.list?.fetchedAt;
  return (
    <SyncStatus
      sweptAt={fetchedAt === undefined ? null : Date.parse(fetchedAt)}
      busy={busy || listing?.syncing === true}
      onRefresh={() => void onRefresh()}
    />
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The row buttons, each one RPC. The quick ones say what they did in a toast
 * with Undo, since a click can land on the wrong row. The page re-reads on the
 * server's signal, so none of them touch local state.
 */
function useRowActions(
  rpc: ReturnType<typeof useListing>["rpc"],
  threads: Pick<RowActions, "onStartThread" | "onOpenThread">,
): RowActions {
  return useMemo(() => {
    const fail = (cause: unknown) => toast.error(messageOf(cause));
    const undo = (id: string) => ({
      label: "Undo",
      onClick: () => {
        rpc.call("items_undo", { id }).then((result) => {
          if (result.error !== null) toast.error(result.error);
        }, fail);
      },
    });

    return {
      ...threads,
      onSnooze: (item, until) => {
        rpc.call("items_snooze", { id: item.id, until }).then(() => {
          const when = new Date(until).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
          toast.success(`Snoozed until ${when}`, {
            action: {
              label: "Undo",
              onClick: () => {
                rpc.call("items_unsnooze", { id: item.id }).catch(fail);
              },
            },
          });
        }, fail);
      },
      onUnsnooze: (item) => {
        rpc.call("items_unsnooze", { id: item.id }).catch(fail);
      },
      onArchive: (item) => {
        rpc.call("items_archive", { id: item.id }).then((result) => {
          if (result.error !== null) toast.error(result.error);
          else toast.success("Archived", { action: undo(item.id) });
        }, fail);
      },
      onComplete: (item) => {
        rpc.call("items_complete", { id: item.id }).then((result) => {
          if (result.error !== null) toast.error(result.error);
          else if (result.undoable) toast.success(`Completed "${item.title}"`, { action: undo(item.id) });
          else toast.success(`Completed "${item.title}". It recurs, so Todoist moved it to its next date.`);
        }, fail);
      },
      onReply: async (item, body) => {
        try {
          const result = await rpc.call("items_reply", { id: item.id, body });
          if (result.error !== null) {
            toast.error(result.error);
            return false;
          }
          toast.success(`Commented on ${item.github?.repo}#${item.github?.number}`);
          return true;
        } catch (cause) {
          fail(cause);
          return false;
        }
      },
    };
  }, [rpc, threads]);
}

function NowPage() {
  const { listing, rpc } = useListing();
  const navigate = useBbNavigate();
  // The row whose composer is open. Null when the dialog is closed.
  const [draft, setDraft] = useState<{ item: Item; seed: StartThreadSeed } | null>(null);
  const threadProjectId = listing?.threadProjectId ?? null;

  const threadActions = useMemo(
    () => ({
      onOpenThread: (threadId: string) => navigate.toThread(threadId),
      onStartThread: (item: Item) =>
        setDraft({
          item,
          seed: {
            projectId: threadProjectId,
            prompt: threadPrompt(item),
            preview: { title: item.title, url: item.url, meta: itemOrigin(item) },
          },
        }),
    }),
    [navigate, threadProjectId],
  );
  const actions = useRowActions(rpc, threadActions);

  const onSubmitDraft = useCallback(
    async (request: NewThreadRequest) => {
      if (draft === null) return;
      const result = await rpc.call("items_start_thread", { id: draft.item.id, request: request as never });
      if (result.threadId === null) {
        toast.error(result.error ?? "Could not start a thread.");
        // Thrown so the composer keeps the draft rather than clearing it.
        throw new Error(result.error ?? "Could not start a thread.");
      }
      setDraft(null);
      if (result.existing) navigate.toThread(result.threadId);
      else toast.success(`Started a thread for "${draft.item.title}"`);
    },
    [draft, navigate, rpc],
  );

  // Shows what is stored at once, and brings it up to date behind it. The
  // server skips this when the list is fresh, and joins a sync already running.
  useEffect(() => {
    rpc.call("items_sync", { ifOlderThanMs: STALE_ON_OPEN_MS }).catch(() => undefined);
  }, [rpc]);

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <ItemListView listing={listing} now={new Date()} actions={actions} />
      <StartThreadDialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        heading="Start a thread"
        description="Write what this thread should do, then start it."
        draftKey={draft === null ? "" : `now:${draft.item.id}`}
        seed={draft?.seed ?? null}
        onSubmit={onSubmitDraft}
      />
    </div>
  );
}

/**
 * How many rows the page has, beside its name in the sidebar: everything the
 * last sync found, less what is snoozed, which is what needs action. It
 * re-reads on the same signal as the page, so completing, archiving, or
 * snoozing a row lowers it at once.
 */
function NeedsActionCount() {
  const { listing } = useListing();
  const count = listing?.list?.items.length ?? 0;
  if (count === 0) return null;
  return <span className="text-xs tabular-nums text-muted-foreground">{count}</span>;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "now",
    title: "Now",
    icon: "Target",
    path: "now",
    component: NowPage,
    headerContent: SyncHeader,
    experimental_sidebarAccessory: NeedsActionCount,
  });
});

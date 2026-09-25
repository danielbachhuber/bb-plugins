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
import type { PendingAction, RowActions } from "./now/item-row.js";
import { sidebarCounts } from "./now/sections.js";
import { SidebarCounts } from "./now/sidebar-counts.js";
import { StartThreadDialog, type StartThreadSeed } from "./now/start-thread-dialog.js";
import { itemOrigin, threadPrompt } from "./now/thread-prompt.js";
import type { Item, TodoistProject } from "./now/types.js";

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

  /** Resolves once the listing has been re-read, so a row can wait on it. */
  const load = useCallback(
    () => rpc.call("items_list", null).then(setListing, () => undefined),
    [rpc],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(SYNC_CHANNEL, () => void load());

  return { listing, rpc, load };
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
/**
 * Which rows are waiting on a request, and a way to run one. A row stays
 * pending until the re-read listing has landed, so it goes straight from
 * "Completing…" to gone instead of flashing back to its normal state first.
 */
function usePending(load: () => Promise<unknown>) {
  const [pending, setPending] = useState<ReadonlyMap<string, PendingAction>>(() => new Map());

  const run = useCallback(
    async (id: string, action: PendingAction, request: () => Promise<void>) => {
      setPending((current) => new Map(current).set(id, action));
      try {
        await request();
        await load();
      } finally {
        setPending((current) => {
          const next = new Map(current);
          next.delete(id);
          return next;
        });
      }
    },
    [load],
  );

  return { pending, run };
}

type Run = ReturnType<typeof usePending>["run"];

/**
 * Undo from a toast: a loading toast that becomes the result, since the row
 * it restores is not on the page to show a pending state of its own.
 */
function undoAction(label: string, request: () => Promise<{ error: string | null } | void>) {
  return {
    label: "Undo",
    onClick: () => {
      const id = toast.loading(label);
      request().then(
        (result) => {
          if (result && result.error !== null) toast.error(result.error, { id });
          else toast.success("Restored", { id });
        },
        (cause) => toast.error(messageOf(cause), { id }),
      );
    },
  };
}

function useRowActions(
  rpc: ReturnType<typeof useListing>["rpc"],
  run: Run,
  threads: Pick<RowActions, "onStartThread" | "onOpenThread">,
): RowActions {
  return useMemo(() => {
    const fail = (cause: unknown) => toast.error(messageOf(cause));
    const undo = (id: string) => undoAction("Restoring…", () => rpc.call("items_undo", { id }));

    return {
      ...threads,
      onArchive: (item) => {
        void run(item.id, "archive", async () => {
          const result = await rpc.call("items_archive", { id: item.id });
          if (result.error !== null) toast.error(result.error);
          else toast.success("Archived", { action: undo(item.id) });
        }).catch(fail);
      },
      onMarkRead: (item) => {
        void run(item.id, "read", async () => {
          const result = await rpc.call("items_mark_read", { id: item.id });
          if (result.error !== null) toast.error(result.error);
          else toast.success("Marked read", { action: undo(item.id) });
        }).catch(fail);
      },
      onComplete: (item) => {
        void run(item.id, "complete", async () => {
          const result = await rpc.call("items_complete", { id: item.id });
          if (result.error !== null) toast.error(result.error);
          else if (result.undoable) toast.success(`Completed "${item.title}"`, { action: undo(item.id) });
          else toast.success(`Completed "${item.title}". It recurs, so Todoist moved it to its next date.`);
        }).catch(fail);
      },
      onRsvp: (item, response) => {
        void run(item.id, `rsvp:${response}`, async () => {
          const result = await rpc.call("items_rsvp", { id: item.id, response });
          if (result.error !== null) toast.error(result.error);
          else toast.success(`Replied ${response === "accepted" ? "yes" : response === "declined" ? "no" : "maybe"}`);
        }).catch(fail);
      },
      onMerge: (item, method) => {
        void run(item.id, "merge", async () => {
          const result = await rpc.call("items_merge", { id: item.id, method });
          const name = `${item.github?.repo}#${item.github?.number}`;
          if (result.error !== null) toast.error(result.error);
          else if (result.merged) toast.success(`Merged ${name}`);
          else toast.success(`${name} is queued to merge`);
        }).catch(fail);
      },
      onEdit: async (item, draft) => {
        let saved = false;
        await run(item.id, "save", async () => {
          // bb's RPC takes JSON values only, so an unchanged deadline is left out rather than sent as undefined.
          const { deadline, ...rest } = draft;
          const input = deadline === undefined ? { id: item.id, ...rest } : { id: item.id, ...rest, deadline };
          const result = await rpc.call("items_edit", input);
          if (result.error !== null) toast.error(result.error);
          else {
            saved = true;
            toast.success(`Saved "${item.title}"`);
          }
        }).catch(fail);
        return saved;
      },
      onDelete: (item) => {
        void run(item.id, "delete", async () => {
          const result = await rpc.call("items_delete", { id: item.id });
          if (result.error !== null) toast.error(result.error);
          else toast.success(`Deleted "${item.title}"`);
        }).catch(fail);
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
  }, [rpc, run, threads]);
}

function NowPage() {
  const { listing, rpc, load } = useListing();
  const { pending, run } = usePending(load);
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
  const actions = useRowActions(rpc, run, threadActions);

  // Read once per visit, for every Todoist row's project picker.
  const [projects, setProjects] = useState<readonly TodoistProject[] | null>(null);
  const hasTodoist = listing?.list?.items.some((item) => item.source === "todoist") === true;
  useEffect(() => {
    if (!hasTodoist || projects !== null) return;
    rpc.call("todoist_projects", null).then(
      (result) => {
        if (result.error !== null) toast.error(`Todoist projects: ${result.error}`);
        else setProjects(result.projects);
      },
      () => undefined,
    );
  }, [hasTodoist, projects, rpc]);

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
      <ItemListView listing={listing} now={new Date()} actions={actions} pending={pending} projects={projects} />
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
 * The inbox and Now counts beside the page's name in the sidebar. It re-reads
 * on the same signal as the page, so completing or archiving a row lowers them
 * at once.
 */
function NowSidebarCounts() {
  const { listing } = useListing();
  return <SidebarCounts {...sidebarCounts(listing?.list?.items ?? [], new Date())} />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "now",
    title: "Now",
    icon: "Target",
    path: "now",
    component: NowPage,
    headerContent: SyncHeader,
    experimental_sidebarAccessory: NowSidebarCounts,
  });
});

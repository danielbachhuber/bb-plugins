import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRealtime,
  useRpc,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { SyncStatus } from "component-library/sync-status";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  StartThreadDialog,
  type StartThreadSeed,
} from "@/components/start-thread-dialog";
import type { HarvestTimerClient } from "bb-plugin-harvest/picker";
import type { rpcContract } from "./server.js";
import { countedRows } from "./issues/board.js";
import {
  IssueListView,
  type HarvestPanelState,
  type Listing,
  type Row,
} from "./issues/list-view.js";

function useListing() {
  const rpc = useRpc<typeof rpcContract>();
  const [listing, setListing] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    setListing((await rpc.call("listRows", null)) as Listing);
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime("issues-updated", () => {
    void load();
  });

  return { listing, reload: load, rpc };
}

/**
 * Adapt Issue Sweep's proxy methods onto the picker's transport-agnostic
 * client, which is what lets the picker source be shared verbatim with the
 * Harvest plugin.
 */
function useHarvestClient(rpc: ReturnType<typeof useRpc<typeof rpcContract>>): HarvestTimerClient {
  return useMemo(
    () => ({
      assignments: () => rpc.call("harvestAssignments", null),
      trackedHours: (input) =>
        rpc.call("harvestTrackedHours", {
          externalId: input.externalId,
          groupId: input.groupId ?? null,
        }),
      startTimer: (input) => rpc.call("harvestStartTimer", input),
      lastSelection: (input) => rpc.call("harvestLastSelection", input),
      stopTimer: async (input) => {
        await rpc.call("harvestStopTimer", input);
      },
    }),
    [rpc],
  );
}

/**
 * The sweep's freshness and its refresh control, in the panel's title bar
 * rather than at the top of its body.
 *
 * Mounted separately from the panel, so it runs its own listing subscription.
 * That is the cost of the slot; it is small, and both mounts reload from the
 * same realtime event, so a refresh started here updates the table too.
 */
function SyncHeader() {
  const { listing, reload, rpc } = useListing();
  const [busy, setBusy] = useState(false);

  const onRefresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await rpc.call("refresh", null);
      if (!result.ok) toast.error(result.error ?? "Sweep failed.");
      await reload();
    } finally {
      setBusy(false);
    }
  }, [reload, rpc]);

  return (
    <SyncStatus
      syncedAt={listing?.sweptAt ?? null}
      busy={busy}
      onRefresh={() => void onRefresh()}
    />
  );
}

function Panel() {
  const { listing, reload, rpc } = useListing();
  const [busy, setBusy] = useState(false);
  // Per-row, not one flag: two statuses can be set in quick succession and a
  // single flag would lock the whole table for the first one.
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [starting, setStarting] = useState<ReadonlySet<string>>(new Set());
  const navigate = useBbNavigate();

  // Opening the issue or its thread is reading it, so the count it has now is
  // the one seen. Recorded on every open, not only when "N new" shows, so a
  // count that dropped when comments were deleted catches up too. Fire and
  // forget: the link or thread opens either way.
  const markSeen = useCallback(
    (row: Row) => {
      rpc
        .call("markSeen", { repo: row.repo, number: row.number })
        .then(reload)
        // Nothing to show for it: the count catches up on the next open.
        .catch((error: unknown) => console.warn(`could not mark #${row.number} seen`, error));
    },
    [reload, rpc],
  );

  const onOpen = useCallback(
    (row: Row) => {
      if (row.threadId) navigate.toThread(row.threadId);
      markSeen(row);
    },
    [markSeen, navigate],
  );

  const onNoteSave = useCallback(
    async (row: Row, body: string) => {
      const result = await rpc.call("setNote", { repo: row.repo, number: row.number, body });
      if (!result.ok) {
        toast.error("Could not save the note.");
        return false;
      }
      await reload();
      return true;
    },
    [reload, rpc],
  );

  const harvestClient = useHarvestClient(rpc);
  const harvest: HarvestPanelState = {
    available: listing?.harvest.available === true,
    running: listing?.harvest.running ?? null,
    client: harvestClient,
    // Starting a timer changes which row is lit, and that state arrives with
    // the listing, so the listing is what has to be re-read.
    onStarted: reload,
  };

  // The issue whose composer is open, with the seeds the backend resolved for
  // it. Null when the dialog is closed.
  const [draft, setDraft] = useState<{ row: Row; seed: StartThreadSeed } | null>(
    null,
  );

  const onStart = useCallback(
    (row: Row) => {
      const key = `${row.repo}#${row.number}`;
      // Marked before awaiting anything, so the button changes on the same tick
      // as the click rather than after the draft returns.
      setStarting((keys) => new Set(keys).add(key));

      void (async () => {
        try {
          const result = await rpc.call("startThreadDraft", {
            repo: row.repo,
            number: row.number,
          });
          // An issue that already has a thread never composes a second one.
          if (result.existingThreadId) {
            navigate.toThread(result.existingThreadId);
            return;
          }
          if (result.seed === null) {
            toast.error(result.reason ?? "Could not start a thread.");
            return;
          }
          setDraft({ row, seed: result.seed });
        } finally {
          setStarting((keys) => {
            const next = new Set(keys);
            next.delete(key);
            return next;
          });
        }
      })();
    },
    [navigate, rpc],
  );

  const onSubmitDraft = useCallback(
    async (request: NewThreadRequest) => {
      if (!draft) return;
      const { repo, number } = draft.row;
      const key = `${repo}#${number}`;
      const result = await rpc.call("startThreadSubmit", {
        repo,
        number,
        request: request as never,
      });
      if (!result.threadId) {
        toast.error(result.reason ?? "Could not start a thread.");
        // Thrown so the composer keeps the draft rather than clearing it.
        throw new Error(result.reason ?? "Could not start a thread.");
      }
      setDraft(null);
      if (!result.existing) toast.success(`Started a thread for ${key}`);
      await reload();
    },
    [draft, reload, rpc],
  );

  const onPick = useCallback(
    async (row: Row, status: string) => {
      const key = `${row.repo}#${row.number}`;
      setBusyKeys((keys) => new Set(keys).add(key));
      try {
        const result = await rpc.call("setBoardStatus", {
          repo: row.repo,
          number: row.number,
          status,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Could not update the board.");
          return;
        }
        toast.success(
          result.added
            ? `Added #${row.number} to the board as ${status}.`
            : `#${row.number} is now ${status}.`,
        );
        await reload();
      } finally {
        setBusyKeys((keys) => {
          const next = new Set(keys);
          next.delete(key);
          return next;
        });
      }
    },
    [reload, rpc],
  );

  const onRefresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await rpc.call("refresh", null);
      if (!result.ok) toast.error(result.error ?? "Sweep failed.");
      await reload();
    } finally {
      setBusy(false);
    }
  }, [reload, rpc]);

  return (
    // 300ms matches the other two panels, so a tooltip in any of them waits
    // the same beat before appearing.
    <TooltipProvider delayDuration={300}>
      <IssueListView
        listing={listing}
        now={Date.now()}
        busyKeys={busyKeys}
        starting={starting}
        harvest={harvest}
        onPick={(row, status) => void onPick(row, status)}
        onStart={onStart}
        onOpen={onOpen}
        onNoteSave={onNoteSave}
        onOpenLink={markSeen}
      />

      <StartThreadDialog
        open={draft !== null}
        onOpenChange={(next) => {
          if (!next) setDraft(null);
        }}
        heading={
          draft ? `Start a thread for #${draft.row.number}` : "Start a thread"
        }
        description="Edit what this thread should do, then start it."
        draftKey={draft ? `issue-sweep:${draft.row.repo}#${draft.row.number}` : ""}
        seed={draft?.seed ?? null}
        onSubmit={onSubmitDraft}
      />
    </TooltipProvider>
  );
}

function AssignedCount() {
  const { listing } = useListing();
  // Not every assigned issue: the badge is a "how much is on me right now"
  // number, and a Backlog item three months out is not on you today.
  const count = listing
    ? countedRows(listing.rows, listing.countedStatuses).length
    : 0;
  if (count === 0) return null;
  return (
    <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "issues",
    title: "Issues",
    icon: "ListTodo",
    path: "issues",
    component: Panel,
    experimental_sidebarAccessory: AssignedCount,
    headerContent: SyncHeader,
  });
});

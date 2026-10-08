import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRealtime,
  useRpc,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { HarvestTimerClient } from "bb-plugin-harvest/picker";
import { SyncStatus } from "@/components/ui/sync-status";
import {
  StartThreadDialog,
  type StartThreadSeed,
} from "@/components/start-thread-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { displaySection } from "./review/actions.js";
import { runOf, sortReviews } from "./review/tiers.js";
import { BatchDialog, type BatchStart } from "./review/batch-dialog.js";
import { SidebarCount } from "sweep-ui/sidebar-count";
import {
  ReviewListView,
  canBatch,
  type HarvestPanelState,
  type Listing,
  type Row,
} from "./review/list-view.js";
import type { rpcContract } from "./server.js";

/**
 * Adapt this panel's proxy methods onto the picker's transport-agnostic
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


function useListing() {
  const rpc = useRpc<typeof rpcContract>();
  const [listing, setListing] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    setListing((await rpc.call("listRows", null)) as Listing);
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime("reviews-updated", () => {
    void load();
  });

  return { listing, reload: load, rpc };
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
      sweptAt={listing?.sweptAt ?? null}
      busy={busy}
      onRefresh={() => void onRefresh()}
    />
  );
}

function Panel() {
  const { listing, reload, rpc } = useListing();
  const harvestClient = useHarvestClient(rpc);
  const harvest: HarvestPanelState = {
    available: listing?.harvest.available === true,
    running: listing?.harvest.running ?? null,
    // Starting a timer changes which row is lit, and that state arrives with
    // the listing, so the listing is what has to be re-read.
    client: harvestClient,
    onStarted: reload,
  };

  const navigate = useBbNavigate();
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<Set<string>>(() => new Set());

  // Sampled once per render rather than read inside each row, so every wait in
  // one paint is measured against the same instant.
  const now = Date.now();

  // Opening the pull request or its thread is reading it, so the count it has
  // now is the one seen. Recorded on every open, not only when "N new" shows,
  // so a count that dropped when comments were deleted catches up too. Fire
  // and forget: the link or thread opens either way.
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
    (row: Row, threadId: string) => {
      navigate.toThread(threadId);
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

  // The review whose composer is open, with the seeds the backend resolved for
  // it. Null when the dialog is closed.
  const [draft, setDraft] = useState<{ row: Row; seed: StartThreadSeed } | null>(
    null,
  );

  const onReview = useCallback(
    (row: Row) => {
      const key = `${row.repo}#${row.number}`;
      // Mark it starting before awaiting anything, so the button changes on the
      // same tick as the click.
      setStarting((current) => new Set(current).add(key));

      void (async () => {
        try {
          const result = await rpc.call("reviewThisDraft", {
            repo: row.repo,
            number: row.number,
          });
          // A review that already has a thread never composes a second one.
          if (result.existingThreadId) {
            onOpen(row, result.existingThreadId);
            return;
          }
          if (result.seed === null) {
            toast.error(result.reason ?? "Could not start a thread.");
            return;
          }
          setDraft({ row, seed: result.seed });
        } finally {
          setStarting((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }
      })();
    },
    [onOpen, rpc],
  );

  const onSubmitDraft = useCallback(
    async (request: NewThreadRequest) => {
      if (!draft) return;
      const { repo, number } = draft.row;
      const key = `${repo}#${number}`;
      const result = await rpc.call("reviewThisSubmit", {
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
      if (!result.existing) toast.success(`Started a review thread for ${key}`);
      await reload();
    },
    [draft, reload, rpc],
  );

  const onArchive = useCallback(
    (row: Row) => {
      void (async () => {
        const result = await rpc.call("archiveThread", { repo: row.repo, number: row.number });
        if (result.ok) toast.success(`Archived the thread for ${row.repo}#${row.number}`);
        else toast.error(result.reason ?? "Could not archive the thread.");
        await reload();
      })();
    },
    [reload, rpc],
  );

  const [batchOpen, setBatchOpen] = useState(false);

  // Starts every ticked review at once. A review that fails stays ticked in
  // the dialog, which stays open to try it again; the ones that started leave
  // the dialog's list as their rows gain a thread.
  const onBatchStart = useCallback(
    async (starts: BatchStart[]) => {
      const keys = starts.map(({ row }) => `${row.repo}#${row.number}`);
      setStarting((current) => new Set([...current, ...keys]));
      try {
        const results = await Promise.all(
          starts.map(({ row, prompt }) =>
            rpc
              .call("reviewBatchStart", { repo: row.repo, number: row.number, prompt })
              .then((result) => ({ row, reason: result.threadId ? null : (result.reason ?? "Could not start a thread.") }))
              .catch((error: unknown) => ({ row, reason: error instanceof Error ? error.message : String(error) })),
          ),
        );
        const failed = results.filter((result) => result.reason !== null);
        const started = results.length - failed.length;
        if (started > 0) toast.success(`Started ${started} review ${started === 1 ? "thread" : "threads"}`);
        for (const { row, reason } of failed) toast.error(`#${row.number}: ${reason}`);
        if (failed.length === 0) setBatchOpen(false);
        await reload();
      } finally {
        setStarting((current) => {
          const next = new Set(current);
          for (const key of keys) next.delete(key);
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
    <TooltipProvider delayDuration={300}>
      <ReviewListView
        listing={listing}
        now={now}
        starting={starting}
        harvest={harvest}
        onReview={onReview}
        onOpen={onOpen}
        onArchive={onArchive}
        onNoteSave={onNoteSave}
        onOpenLink={markSeen}
        onBatch={() => setBatchOpen(true)}
      />

      <BatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        rows={
          listing
            ? sortReviews(listing.rows, { staleAfterDays: listing.staleAfterDays, now }).filter(canBatch)
            : []
        }
        now={now}
        onStart={onBatchStart}
      />

      <StartThreadDialog
        open={draft !== null}
        onOpenChange={(next) => {
          if (!next) setDraft(null);
        }}
        heading={
          draft ? `Start a review thread for #${draft.row.number}` : "Start a thread"
        }
        description="Edit what this thread should do, then start it."
        draftKey={
          draft ? `review-sweep:${draft.row.repo}#${draft.row.number}` : ""
        }
        seed={draft?.seed ?? null}
        onSubmit={onSubmitDraft}
      />
    </TooltipProvider>
  );
}

/**
 * Beside Reviews in the sidebar: the requests waiting too long in a red
 * circle, as Now shows its urgent rows, then every request still to review,
 * which includes them. The circle is left out at zero, and both are when
 * nothing is waiting.
 */
function NeedsReviewCount() {
  const { listing } = useListing();
  const rows =
    listing?.rows.filter(
      (row) =>
        displaySection(Boolean(row.threadId), row.isDraft) === "needs-review",
    ) ?? [];
  if (!listing) return null;
  const inputs = { staleAfterDays: listing.staleAfterDays, now: Date.now() };
  const overdue = rows.filter((row) => runOf(row, inputs) === "overdue").length;
  return (
    <SidebarCount
      urgent={overdue}
      total={rows.length}
      urgentLabel={`${overdue} waiting too long`}
      totalLabel={`${rows.length} to review`}
    />
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "reviews",
    title: "Reviews",
    icon: "Eye",
    path: "reviews",
    component: Panel,
    experimental_sidebarAccessory: NeedsReviewCount,
    headerContent: SyncHeader,
  });
});

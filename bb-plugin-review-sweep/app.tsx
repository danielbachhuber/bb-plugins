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
import { displaySection, returnsInLabel } from "./review/actions.js";
import {
  ReviewListView,
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

  const onOpen = useCallback(
    (threadId: string) => {
      navigate.toThread(threadId);
    },
    [navigate],
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
            navigate.toThread(result.existingThreadId);
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
    [navigate, rpc],
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

  const onSnooze = useCallback(
    (row: Row) => {
      void (async () => {
        const { until } = await rpc.call("snooze", { repo: row.repo, number: row.number });
        toast.success(`Ignoring ${row.repo}#${row.number}, ${returnsInLabel(until, Date.now())}`);
        await reload();
      })();
    },
    [reload, rpc],
  );

  const onUnsnooze = useCallback(
    (row: Row) => {
      void (async () => {
        await rpc.call("unsnooze", { repo: row.repo, number: row.number });
        toast.success(`${row.repo}#${row.number} is back in the queue`);
        await reload();
      })();
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
        onSnooze={onSnooze}
        onUnsnooze={onUnsnooze}
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

function NeedsReviewCount() {
  const { listing } = useListing();
  const count =
    listing?.rows.filter(
      (row) =>
        displaySection(Boolean(row.threadId), row.isDraft, Boolean(row.snoozedUntil)) ===
        "needs-review",
    ).length ?? 0;
  if (count === 0) return null;
  return <span className="text-xs tabular-nums text-muted-foreground">{count}</span>;
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

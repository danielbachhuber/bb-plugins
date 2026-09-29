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
import { OpenPullRequestPage } from "./sweep/open-panel.js";
import {
  FIXED_ENVIRONMENT_CSS,
  StartThreadDialog,
  type StartThreadSeed,
} from "@/components/start-thread-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isCounted, sectionForRow } from "./sweep/actions.js";
import {
  PrListView,
  type HarvestPanelState,
  type Listing,
  type Row,
} from "./sweep/list-view.js";
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

  useRealtime("prs-updated", () => {
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

  // The pull request whose composer is open, with the seeds the backend
  // resolved for it. Null when the dialog is closed.
  const [draft, setDraft] = useState<{ row: Row; seed: StartThreadSeed } | null>(
    null,
  );

  const onWork = useCallback(
    (row: Row) => {
      const key = `${row.repo}#${row.number}`;
      // Mark it starting before awaiting anything, so the button changes on
      // the same tick as the click.
      setStarting((current) => new Set(current).add(key));

      void (async () => {
        try {
          const result = await rpc.call("workOnThisDraft", {
            repo: row.repo,
            number: row.number,
          });
          // A pull request that already has a thread never composes a second one.
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
      const result = await rpc.call("workOnThisSubmit", {
        repo,
        number,
        request: request as never,
        onBranch: Boolean(draft.seed.workspace?.branch),
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

  const onArchive = useCallback(
    (row: Row) => {
      void (async () => {
        const result = await rpc.call("archiveThread", {
          repo: row.repo,
          number: row.number,
        });
        if (result.ok) toast.success(`Archived the thread for ${row.repo}#${row.number}`);
        else toast.error(result.reason ?? "Could not archive the thread.");
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
      <PrListView
        listing={listing}
        now={Date.now()}
        starting={starting}
        harvest={harvest}
        onWork={onWork}
        onOpen={onOpen}
        onArchive={onArchive}
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
        draftKey={draft ? `pr-sweep:${draft.row.repo}#${draft.row.number}` : ""}
        seed={draft?.seed ?? null}
        onSubmit={onSubmitDraft}
      />
    </TooltipProvider>
  );
}

function NeedsActionCount() {
  const { listing } = useListing();
  const count =
    listing?.rows.filter((row) => isCounted(sectionForRow(row))).length ?? 0;
  if (count === 0) return null;
  return <span className="text-xs tabular-nums text-muted-foreground">{count}</span>;
}

export default definePluginApp((app) => {
  // The dialog marks a composer whose environment this plugin decides; this
  // hides that composer's pickers, which would otherwise offer choices the
  // server ignores.
  app.contentScripts.register({
    id: "hide-fixed-environment-pickers",
    mount({ signal }) {
      const style = document.createElement("style");
      style.dataset.prSweep = "hide-fixed-environment-pickers";
      style.textContent = FIXED_ENVIRONMENT_CSS;
      document.head.appendChild(style);
      const remove = () => style.remove();
      signal.addEventListener("abort", remove, { once: true });
      return remove;
    },
  });

  app.slots.navPanel({
    id: "open-pr",
    title: "Open pull request",
    icon: "FolderGit",
    path: "open-pr",
    component: OpenPullRequestPage,
  });

  app.slots.navPanel({
    id: "prs",
    title: "Pull requests",
    icon: "GitPullRequest",
    path: "prs",
    component: Panel,
    headerContent: SyncHeader,
    experimental_sidebarAccessory: NeedsActionCount,
  });
});
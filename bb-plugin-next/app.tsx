// bb-plugin-next — the Next page: what to do next, from every source.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { SyncStatus } from "@/components/ui/sync-status";

import type { rpcContract } from "./server";
import { SYNC_CHANNEL, type Listing } from "./next/contract.js";
import { ItemListView } from "./next/item-list.js";

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

function NextPage() {
  const { listing, rpc } = useListing();

  // Shows what is stored at once, and brings it up to date behind it. The
  // server skips this when the list is fresh, and joins a sync already running.
  useEffect(() => {
    rpc.call("items_sync", { ifOlderThanMs: STALE_ON_OPEN_MS }).catch(() => undefined);
  }, [rpc]);

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <ItemListView listing={listing} now={new Date()} />
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "next",
    title: "Next",
    icon: "Target",
    path: "next",
    component: NextPage,
    headerContent: SyncHeader,
  });
});

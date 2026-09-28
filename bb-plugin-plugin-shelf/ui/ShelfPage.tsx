// The My plugins page: loads the shelf over RPC and hands it to ShelfTable.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { rpcContract } from "../shelf/contract";
import { ShelfTable } from "./ShelfTable";
import { shelfStore } from "./shelf-store";

function useShelf() {
  const rpc = useRpc<typeof rpcContract>();
  const state = useSyncExternalStore(shelfStore.subscribe, shelfStore.getSnapshot);
  const load = useCallback(
    (refresh: boolean) =>
      shelfStore.load((r) => rpc.call("shelf_list", { refresh: r }), refresh),
    [rpc],
  );
  return { rpc, state, load };
}

export function ShelfPage() {
  const { rpc, state, load } = useShelf();
  const navigate = useBbNavigate();
  const [providerId, setProviderId] = useState("claude-code");
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => {
    void load(true);
    rpc.call("shelf_settings", {}).then(
      (settings) => setProviderId(settings.providerId),
      () => {},
    );
  }, [load, rpc]);

  const publish = useCallback(
    async (pluginId: string) => {
      setPublishing(pluginId);
      try {
        const { threadId } = await rpc.call("shelf_publish", { pluginId });
        navigate.toThread(threadId);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Could not start the thread.");
      } finally {
        setPublishing(null);
      }
    },
    [navigate, rpc],
  );

  const body =
    state.list === null ? (
      <p className="py-6 text-sm text-muted-foreground">
        {state.error ?? "Loading plugins…"}
      </p>
    ) : (
      <ShelfTable
        list={state.list}
        providerId={providerId}
        publishing={publishing}
        onPublish={(id) => void publish(id)}
      />
    );

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        {body}
      </div>
    </div>
  );
}

/** In the page's title bar: fetch from GitHub and re-read the marketplace. */
export function ShelfRefresh() {
  const { state, load } = useShelf();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Refresh"
      disabled={state.loading}
      onClick={() => void load(true)}
    >
      <Icon
        name="RotateCcw"
        className={state.loading ? "size-4 animate-spin" : "size-4"}
        aria-hidden
      />
    </Button>
  );
}

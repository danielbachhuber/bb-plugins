// The My plugins page: loads the shelf over RPC and hands it to ShelfTable.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useBbNavigate, useRpc, type NewThreadRequest } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { rpcContract } from "../shelf/contract";
import { ShelfTable } from "./ShelfTable";
import { StartThreadDialog, announceStartedThread } from "@danielbachhuber/bb-plugin-component-library/start-thread";
import * as dialogParts from "@/components/ui/dialog";
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

/**
 * Drawn inside bb's Plugins screen, which has no title bar for a plugin's
 * Refresh button, so the page carries its title and Refresh itself.
 */
export function ShelfPage() {
  const { rpc, state, load } = useShelf();
  const navigate = useBbNavigate();
  const [providerId, setProviderId] = useState("claude-code");
  const [publishing, setPublishing] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [threadFor, setThreadFor] = useState<string | null>(null);

  useEffect(() => {
    void load(true);
    rpc.call("shelf_project", {}).then(
      (project) => setProjectId(project.projectId),
      () => {},
    );
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
        announceStartedThread(navigate, threadId, "Started a thread to publish the update");
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Could not start the thread.");
      } finally {
        setPublishing(null);
      }
    },
    [navigate, rpc],
  );

  const startThread = useCallback(
    async (request: NewThreadRequest) => {
      if (threadFor === null) return;
      try {
        const { threadId } = await rpc.call("shelf_thread_create", {
          pluginId: threadFor,
          request: request as never,
        });
        setThreadFor(null);
        announceStartedThread(navigate, threadId);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Could not start the thread.");
        // Rethrow so the composer keeps the draft rather than clearing it.
        throw cause;
      }
    },
    [navigate, rpc, threadFor],
  );

  const threadPlugin = state.list?.rows.find((row) => row.id === threadFor) ?? null;

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
        onStartThread={setThreadFor}
      />
    );

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-medium text-foreground">My plugins</h2>
          <ShelfRefresh />
        </div>
        {body}
      </div>
      <StartThreadDialog
        dialog={dialogParts}
        heading={`Start a thread on ${threadPlugin?.name ?? ""}`}
        description="Describe what the thread should do with this plugin."
        // One saved draft per plugin, so a half-written thread for one
        // plugin does not appear in another's dialog.
        draftKey={`plugin-shelf:${threadFor ?? ""}`}
        seed={
          threadPlugin
            ? {
                projectId,
                placeholder: `What should this thread do with ${threadPlugin.name}?`,
                preview: { title: threadPlugin.name, tag: `${threadPlugin.dir}/`, meta: threadPlugin.description },
              }
            : null
        }
        onClose={() => setThreadFor(null)}
        onSubmit={startThread}
      />
    </div>
  );
}

/** Beside the page's title: fetch from GitHub and re-read the marketplace. */
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

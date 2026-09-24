// bb-plugin-now — what needs doing now, gathered from every configured source.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { createGwsRunner, type GwsRunner } from "./gmail/gws.js";
import { DEFAULT_MAX_THREADS, DEFAULT_QUERY, gmailSource, rememberedAccount } from "./gmail/source.js";
import { rpcContract, SYNC_CHANNEL } from "./now/contract.js";
import { keepFailedSources, loadSources, type Source } from "./now/sources.js";
import { createStore, MIGRATIONS } from "./now/store.js";
import { CONFIGURE_HINT, DEFAULT_FILTER, todoistSource } from "./todoist/source.js";

export { rpcContract } from "./now/contract.js";

export interface PluginDeps {
  fetch?: typeof fetch;
  /** Builds the gws runner for a command path. */
  gws?: (command: string) => GwsRunner;
  now?: () => Date;
  /** Waits between background syncs; resolves early when the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** A plain setTimeout would sleep through a reload's stop window. */
function sleepUntilAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The plugin factory, with its I/O injected so it is testable without a network. */
export function createPlugin(deps: PluginDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const makeRunner = deps.gws ?? createGwsRunner;
  const sleep = deps.sleep ?? sleepUntilAborted;

  return async function plugin(bb: BbPluginApi) {
    const settings = bb.settings.define({
      todoistApiToken: {
        type: "string",
        label: "Todoist API token",
        description: "From Todoist's Settings → Integrations → Developer.",
        secret: true,
      },
      todoistFilter: {
        type: "string",
        label: "Todoist filter",
        description: 'A Todoist filter query, such as "today | overdue" or "#Work & p1".',
        default: DEFAULT_FILTER,
      },
      gmailEnabled: {
        type: "boolean",
        label: "Show Gmail",
        description: "Read Gmail through the gws CLI.",
        default: true,
      },
      gmailQuery: {
        type: "string",
        label: "Gmail search",
        description: 'A Gmail search, such as "in:inbox" or "in:inbox is:unread".',
        default: DEFAULT_QUERY,
      },
      gmailMaxThreads: {
        type: "number",
        label: "Gmail threads to show",
        description: "The most recent threads matching the search, up to 500.",
        default: DEFAULT_MAX_THREADS,
      },
      gwsPath: {
        type: "string",
        label: "Path to the gws CLI",
        default: "gws",
      },
      syncIntervalMinutes: {
        type: "select",
        label: "Sync interval (minutes)",
        description: "How often the list syncs in the background. Opening the page also syncs a list older than a minute.",
        options: ["5", "15", "30", "60"],
        default: "15",
      },
    });

    const db = bb.storage.database();
    bb.storage.migrate(db, MIGRATIONS);
    const store = createStore(db as never);

    // Read here only to decide the load-time status: with no source switched
    // on, the page has nothing to show. The handler re-reads, so a changed
    // setting takes effect on the next refresh.
    const initial = await settings.get();
    if (!initial.todoistApiToken && !initial.gmailEnabled) bb.status.needsConfiguration(CONFIGURE_HINT);

    /** One runner and remembered account per gws path, so the account is asked for once. */
    let gws: { path: string; run: GwsRunner; account: () => Promise<string | null> } | null = null;
    function gwsFor(path: string) {
      if (gws === null || gws.path !== path) {
        const run = makeRunner(path);
        gws = { path, run, account: rememberedAccount(run) };
      }
      return gws;
    }

    async function sources(): Promise<Source[]> {
      const values = await settings.get();
      const list = [
        todoistSource({ token: values.todoistApiToken, filter: values.todoistFilter, fetch: deps.fetch }),
      ];
      if (values.gmailEnabled) {
        const { run, account } = gwsFor(values.gwsPath.trim() || "gws");
        list.push(gmailSource({ run, account, query: values.gmailQuery, maxThreads: values.gmailMaxThreads }));
      }
      return list;
    }

    /** The sync running now, which every caller joins rather than starting a second. */
    let running: Promise<void> | null = null;

    function sync(): Promise<void> {
      running ??= (async () => {
        bb.realtime.publish(SYNC_CHANNEL, { syncing: true });
        try {
          const loaded = await loadSources(await sources(), now(), (source, message) => {
            bb.log.warn(`Could not load ${source.name}: ${message}`);
          });
          store.replace(keepFailedSources(store.read(), loaded));
        } finally {
          running = null;
          bb.realtime.publish(SYNC_CHANNEL, { syncing: false });
        }
      })();
      return running;
    }

    /** Milliseconds since the stored list synced, or null before the first sync. */
    function age(): number | null {
      const stored = store.read();
      return stored === null ? null : now().getTime() - Date.parse(stored.fetchedAt);
    }

    bb.rpc.register(rpcContract, {
      items_list: async () => ({ list: store.read(), syncing: running !== null }),
      items_sync: async (input) => {
        const current = age();
        if (input?.ifOlderThanMs !== undefined && current !== null && current < input.ifOlderThanMs) {
          return { synced: false, error: null };
        }
        try {
          await sync();
          return { synced: true, error: null };
        } catch (error) {
          bb.log.error(`Sync failed: ${messageOf(error)}`);
          return { synced: false, error: messageOf(error) };
        }
      },
    });

    bb.background.service("sync", {
      async start(signal) {
        while (!signal.aborted) {
          try {
            await sync();
          } catch (error) {
            bb.log.error(`Sync failed: ${messageOf(error)}`);
          }
          if (signal.aborted) return;
          const { syncIntervalMinutes } = await settings.get();
          await sleep(Number(syncIntervalMinutes) * 60_000, signal);
        }
      },
    });
  };
}

export default createPlugin();

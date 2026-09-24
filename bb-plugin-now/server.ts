// bb-plugin-now — what needs doing now, gathered from every configured source.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { createGhRunner, fetchStates, postComment, type GhRunner } from "./github/gh.js";
import { createGwsRunner, runJson, type GwsRunner } from "./gmail/gws.js";
import { DEFAULT_MAX_THREADS, DEFAULT_QUERY, gmailSource, rememberedAccount } from "./gmail/source.js";
import { rpcContract, SYNC_CHANNEL } from "./now/contract.js";
import { keepFailedSources, loadSources, type Source } from "./now/sources.js";
import { partitionSnoozed } from "./now/snooze.js";
import { createStore, MIGRATIONS } from "./now/store.js";
import { createTodoistApi } from "./todoist/api.js";
import { CONFIGURE_HINT, DEFAULT_FILTER, todoistSource } from "./todoist/source.js";
import type { Item } from "./now/types.js";

export { rpcContract } from "./now/contract.js";

export interface PluginDeps {
  fetch?: typeof fetch;
  /** Builds the gws runner for a command path. */
  gws?: (command: string) => GwsRunner;
  /** Builds the gh runner for a command path. */
  gh?: (command: string) => GhRunner;
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
  const makeGh = deps.gh ?? createGhRunner;
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
      ghPath: {
        type: "string",
        label: "Path to the gh CLI",
        description: "Used for the state of pull requests and issues GitHub emails about, and for replying to them.",
        default: "gh",
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

    async function gh(): Promise<GhRunner> {
      const { ghPath } = await settings.get();
      return makeGh(ghPath.trim() || "gh");
    }

    async function sources(): Promise<Source[]> {
      const values = await settings.get();
      const list = [
        todoistSource({ token: values.todoistApiToken, filter: values.todoistFilter, fetch: deps.fetch }),
      ];
      if (values.gmailEnabled) {
        const { run, account } = gwsFor(values.gwsPath.trim() || "gws");
        const ghRun = await gh();
        list.push(
          gmailSource({
            run,
            account,
            query: values.gmailQuery,
            maxThreads: values.gmailMaxThreads,
            githubStates: (refs) => fetchStates(ghRun, refs),
            onWarn: (message) => bb.log.warn(message),
          }),
        );
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
          store.pruneSnoozes(now());
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

    function announce() {
      bb.realtime.publish(SYNC_CHANNEL, { syncing: running !== null });
    }

    /**
     * Rows archived or completed from the page, kept so Undo can put them back.
     * In memory only: an undo is for the moment after the click, and a
     * restart ends that moment.
     */
    const undoable = new Map<string, { item: Item; action: "archive" | "complete"; position: number }>();
    const UNDO_LIMIT = 50;
    function remember(item: Item, action: "archive" | "complete") {
      undoable.delete(item.id);
      undoable.set(item.id, { item, action, position: store.positionOf(item.id) });
      if (undoable.size > UNDO_LIMIT) undoable.delete(undoable.keys().next().value!);
    }

    async function todoist() {
      const { todoistApiToken } = await settings.get();
      return todoistApiToken ? createTodoistApi({ token: todoistApiToken, fetch: deps.fetch }) : null;
    }

    async function setInbox(threadIds: readonly string[], inInbox: boolean) {
      const { gwsPath } = await settings.get();
      const { run } = gwsFor(gwsPath.trim() || "gws");
      for (const threadId of threadIds) {
        await runJson(run, [
          "gmail", "users", "threads", "modify",
          "--params", JSON.stringify({ userId: "me", id: threadId }),
          "--json", JSON.stringify(inInbox ? { addLabelIds: ["INBOX"] } : { removeLabelIds: ["INBOX"] }),
        ]);
      }
    }

    function findItem(id: string) {
      return store.read()?.items.find((item) => item.id === id) ?? null;
    }

    bb.rpc.register(rpcContract, {
      items_list: async () => {
        const stored = store.read();
        if (stored === null) return { list: null, snoozed: [], syncing: running !== null };
        const { active, snoozed } = partitionSnoozed(stored.items, store.snoozes(), now());
        return { list: { ...stored, items: active }, snoozed, syncing: running !== null };
      },
      items_snooze: async ({ id, until }) => {
        store.snooze(id, { until, activityAt: findItem(id)?.activityAt ?? null }, now());
        announce();
        return { until };
      },
      items_unsnooze: async ({ id }) => {
        store.unsnooze(id);
        announce();
        return { unsnoozed: true };
      },
      items_archive: async ({ id }) => {
        const item = findItem(id);
        if (item?.gmail == null) return { archived: false, error: "Only an email can be archived." };
        try {
          await setInbox(item.gmail.threadIds, false);
        } catch (error) {
          bb.log.warn(`Could not archive ${id}: ${messageOf(error)}`);
          return { archived: false, error: messageOf(error) };
        }
        remember(item, "archive");
        store.removeItem(id);
        announce();
        return { archived: true, error: null };
      },
      items_complete: async ({ id }) => {
        const item = findItem(id);
        if (item?.source !== "todoist") {
          return { completed: false, undoable: false, error: "Only a Todoist task can be completed." };
        }
        const api = await todoist();
        if (api === null) return { completed: false, undoable: false, error: "Todoist is not set up." };
        try {
          await api.close(id.slice("todoist:".length));
        } catch (error) {
          bb.log.warn(`Could not complete ${id}: ${messageOf(error)}`);
          return { completed: false, undoable: false, error: messageOf(error) };
        }
        const recurring = item.due?.recurring === true;
        if (!recurring) remember(item, "complete");
        store.removeItem(id);
        announce();
        return { completed: true, undoable: !recurring, error: null };
      },
      items_undo: async ({ id }) => {
        const entry = undoable.get(id);
        if (entry === undefined) return { restored: false, error: "That is too long ago to undo here." };
        try {
          if (entry.action === "archive") {
            await setInbox(entry.item.gmail?.threadIds ?? [], true);
          } else {
            const api = await todoist();
            if (api === null) return { restored: false, error: "Todoist is not set up." };
            await api.reopen(id.slice("todoist:".length));
          }
        } catch (error) {
          bb.log.warn(`Could not undo ${entry.action} of ${id}: ${messageOf(error)}`);
          return { restored: false, error: messageOf(error) };
        }
        undoable.delete(id);
        store.restoreItem(entry.item, entry.position);
        announce();
        return { restored: true, error: null };
      },
      items_reply: async ({ id, body }) => {
        const item = findItem(id);
        if (item?.github == null) return { url: null, error: "Only a GitHub row can be replied to." };
        try {
          const url = await postComment(await gh(), item.github, body);
          bb.log.info(`Commented on ${item.github.repo}#${item.github.number}`);
          return { url: url === "" ? null : url, error: null };
        } catch (error) {
          bb.log.warn(`Could not comment on ${item.github.repo}#${item.github.number}: ${messageOf(error)}`);
          return { url: null, error: messageOf(error) };
        }
      },
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

// bb-plugin-plugin-shelf — backend entry.
//
// Gathers the inputs with shelf/git.ts and bb's plugin catalog, classifies
// them with shelf/classify.ts, and keeps the last good result so a refresh
// that cannot reach GitHub still has something true to show.
import { realpathSync } from "node:fs";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { buildRow, matchEntry, normalizeRepoUrl, releaseFor, sortRows } from "./shelf/classify";
import { rpcContract } from "./shelf/contract";
import {
  commitsSince,
  ensureTags,
  fetchMain,
  findCheckout,
  readIndex,
  remoteTags,
  runGit,
  type RunGit,
} from "./shelf/git";
import type { MarketplaceEntry, ShelfList, ShelfRow } from "./shelf/types";

/** The marketplace a published plugin is listed in. */
const MARKETPLACE = "bb-community";

/** `git fetch` runs on refresh, but no more often than this. */
const FETCH_INTERVAL_MS = 60_000;

export interface ShelfDeps {
  git: RunGit;
  now: () => number;
  /** This plugin's id, to find the checkout it was installed from. */
  selfId: string;
  listInstalled: () => Promise<{ id: string; rootDir: string; enabled: boolean }[]>;
  searchCatalog: (
    query: string,
  ) => Promise<{ entryId: string; pluginId: string; marketplace: string }[]>;
  installPlan: (entryId: string) => Promise<{
    kind: string;
    url?: string;
    subdir?: string;
    range?: string;
    tagPrefix?: string;
  }>;
}

/**
 * `git rev-parse --show-toplevel` resolves symlinks (on macOS, /var is
 * /private/var) while a bb project keeps the path it was given, so paths are
 * compared resolved.
 */
function samePath(a: string, b: string): boolean {
  const resolve = (path: string) => {
    try {
      return realpathSync(path);
    } catch {
      return path;
    }
  };
  return resolve(a) === resolve(b);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createShelf(deps: ShelfDeps) {
  let last: ShelfList | null = null;
  let lastFetch = 0;

  /**
   * bb's search is a text search, so a short id like `now` matches plenty of
   * entries that are not this plugin. Only an exact id in bb-community counts.
   */
  async function marketplaceEntries(ids: string[]): Promise<MarketplaceEntry[]> {
    const entries: MarketplaceEntry[] = [];
    for (const id of ids) {
      const hits = (await deps.searchCatalog(id)).filter(
        (hit) => hit.pluginId === id && hit.marketplace === MARKETPLACE,
      );
      for (const hit of hits) {
        const source = await deps.installPlan(hit.entryId);
        if (source.kind !== "git" || source.url === undefined) continue;
        entries.push({
          pluginId: id,
          entryId: hit.entryId,
          url: source.url,
          subdir: source.subdir ?? null,
          range: source.range ?? null,
          tagPrefix: source.tagPrefix ?? null,
        });
      }
    }
    return entries;
  }

  async function list(refresh: boolean): Promise<ShelfList> {
    const installed = await deps.listInstalled();
    const self = installed.find((p) => p.id === deps.selfId);
    const found = self
      ? await findCheckout(deps.git, self.rootDir)
      : { error: "Plugin Shelf is not in bb's plugin list." };
    if ("error" in found) {
      return {
        checkout: null,
        emptyReason: found.error,
        rows: [],
        fetchedAt: null,
        fetchError: null,
        marketplaceError: null,
      };
    }
    const { root, originUrl } = found;
    const repo = normalizeRepoUrl(originUrl);

    let fetchError: string | null = null;
    let tags: string[] = [];
    try {
      if (refresh && deps.now() - lastFetch >= FETCH_INTERVAL_MS) {
        await fetchMain(deps.git, root);
        lastFetch = deps.now();
      }
      tags = await remoteTags(deps.git, root);
    } catch (error) {
      if (last !== null) return { ...last, fetchError: message(error) };
      fetchError = message(error);
    }

    const plugins = await readIndex(root, new Set(installed.map((p) => p.id)));
    let entries: MarketplaceEntry[] | null;
    let marketplaceError: string | null = null;
    try {
      entries = await marketplaceEntries(plugins.map((p) => p.id));
    } catch (error) {
      entries = null;
      marketplaceError = message(error);
    }
    // With no tags to compare against, a published plugin cannot be called
    // current or behind, so every row is unknown rather than "no release".
    if (fetchError !== null) entries = null;

    const releases = plugins.map((plugin) => {
      const entry = entries === null ? null : matchEntry(plugin, entries, repo).entry;
      return { plugin, entry, tag: entry === null ? null : releaseFor(entry, tags).latestTag };
    });
    try {
      await ensureTags(
        deps.git,
        root,
        releases.flatMap((r) => (r.tag === null ? [] : [r.tag])),
      );
    } catch (error) {
      if (last !== null) return { ...last, fetchError: message(error) };
      fetchError = message(error);
      entries = null;
    }

    const rows: ShelfRow[] = [];
    for (const { plugin, entry, tag } of releases) {
      const commits =
        entries === null || entry === null
          ? []
          : await commitsSince(deps.git, root, tag, plugin.dir);
      rows.push(buildRow({ plugin, entries, repo, tags, commits }));
    }

    const result: ShelfList = {
      checkout: { root, repo },
      emptyReason: null,
      rows: sortRows(rows),
      fetchedAt: lastFetch === 0 ? null : lastFetch,
      fetchError,
      marketplaceError,
    };
    // Only a fully read result is worth falling back to later.
    if (fetchError === null && marketplaceError === null) last = result;
    return result;
  }

  return { list };
}

export function publishInstruction(pluginId: string): string {
  return (
    `Use the publish-plugin-update skill to publish an update of the ` +
    `${pluginId} plugin in this repository.`
  );
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    providerId: {
      type: "string",
      label: "Provider for spawned threads",
      // The skill ships with this plugin, but it was written and tested on
      // Claude Code; pinned so the thread does not inherit bb's default.
      default: "claude-code",
    },
  });

  const shelf = createShelf({
    git: runGit,
    now: Date.now,
    selfId: bb.pluginId,
    listInstalled: async () => (await bb.sdk.plugins.list()).plugins,
    searchCatalog: async (query) =>
      (await bb.sdk.plugins.catalog.search({ query })).results,
    installPlan: async (entryId) => {
      const plan = await bb.sdk.plugins.catalog.installPlan({
        entryId,
        marketplace: MARKETPLACE,
      });
      return "resolvedSource" in plan ? plan.resolvedSource : { kind: "none" };
    },
  });

  bb.rpc.register(rpcContract, {
    shelf_list: ({ refresh }) => shelf.list(refresh ?? false),
    shelf_settings: async () => ({ providerId: (await settings.get()).providerId }),
    shelf_publish: async ({ pluginId }) => {
      const listed = await shelf.list(false);
      const checkout = listed.checkout;
      const row = listed.rows.find((r) => r.id === pluginId);
      if (!row || checkout === null) {
        throw new Error(`${pluginId} is not in this checkout.`);
      }
      if (row.entryId === null) throw new Error(`${row.name} is not published.`);

      // The release commit belongs on main, so the thread works in the
      // checkout itself rather than in a fresh worktree.
      const projects = await bb.sdk.projects.list();
      let target: { projectId: string; hostId: string; path: string } | null = null;
      for (const project of projects) {
        const source = project.sources.find(
          (s) => s.type === "local_path" && typeof s.path === "string" && samePath(s.path, checkout.root),
        );
        if (source && "hostId" in source && typeof source.hostId === "string") {
          target = { projectId: project.id, hostId: source.hostId, path: source.path as string };
          break;
        }
      }
      if (target === null) {
        throw new Error(`No bb project has ${checkout.root} as its folder.`);
      }

      const { providerId } = await settings.get();
      const thread = await bb.sdk.threads.spawn({
        projectId: target.projectId,
        providerId,
        environment: {
          type: "host",
          hostId: target.hostId,
          workspace: { type: "unmanaged", path: target.path },
        },
        title: `Publish ${row.name}`,
        input: [{ type: "text", text: publishInstruction(pluginId), mentions: [] }],
      } as Parameters<typeof bb.sdk.threads.spawn>[0]);
      bb.log.info(`spawned publish thread ${thread.id} for ${pluginId}`);
      return { threadId: thread.id };
    },
  });
}

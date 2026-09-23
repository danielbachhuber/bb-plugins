import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createHarvestBridge } from "bb-plugin-harvest/bridge";
import { rpcContract } from "./review/contract.js";
import { GhUnavailableError, createGhRunner, runSweep } from "./review/gh.js";
import { buildPromptParts, headerItem, trailerItem } from "./review/prompt.js";
import {
  parsePermissionMode,
  parseStaleAfterDays,
  snoozeUntil,
  threadTitle,
} from "./review/actions.js";
import {
  buildRepoFilter,
  matchProjectTargetForRepo,
  matchProjectForRepo,
  toProjectCandidates,
  type ProjectCandidate,
  type RepoFilter,
} from "./review/spawn-target.js";
import { MIGRATIONS, createStore } from "./review/store.js";
import { createSweepLinks, createThreadLinksBridge } from "bb-plugin-gh-context/links";

export { rpcContract };

const REALTIME_CHANNEL = "reviews-updated";

const GH_CONTEXT_REQUIRED =
  "Review Sweep needs the gh-context plugin, which records which threads belong to which pull requests. Install it, then reload Review Sweep.";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    syncIntervalMinutes: {
      type: "select",
      label: "Sync interval (minutes)",
      options: ["2", "5", "15"],
      default: "5",
    },
    ghPath: {
      type: "string",
      label: "Path to the gh CLI",
      default: "gh",
    },
    filterToProjects: {
      type: "select",
      label: "Only show repositories checked out here",
      // On: a review request is shown only when a bb project on this machine
      // has that repository's git remote. bb's project list is
      // per-installation, so this is what separates the computer a repository
      // lives on from every other one. Off shows every request GitHub returns.
      options: ["on", "off"],
      default: "on",
    },
    extraRepositories: {
      type: "string",
      label: "Also show these repositories",
      // Comma or newline separated owner/name, for a repository you review in
      // without a checkout here. Ignored when the filter is off.
      default: "",
    },
    staleAfterDays: {
      type: "string",
      label: "Stale after (days)",
      // How long a request may sit before its age is emphasised. A personal
      // number rather than a universal one, which is why it is a setting.
      default: "2",
    },
    model: {
      type: "string",
      label: "Model for review threads",
      // Blank takes the provider's default. There is only one action here, so
      // this is a single value rather than pr-sweep's model-by-action JSON.
      default: "",
    },
    permissionMode: {
      type: "select",
      label: "Permission mode for spawned threads",
      // auto keeps the workspace sandbox, which blocks network egress, so the
      // thread cannot reach GitHub to read the diff it was started for. full is
      // the only mode that lets a review happen unattended. Note what this does
      // NOT do: the sandbox cannot express "may read GitHub, may not write to
      // it", so the rule against posting lives in the prompt, not here.
      options: ["accept-edits", "auto", "full"],
      default: "full",
    },
    providerId: {
      type: "string",
      label: "Provider for spawned threads",
      // `code-review` is a Claude Code command, so it is invisible to a thread
      // running on any other provider, which would improvise a review instead
      // of following it. Blank falls back to bb's default.
      default: "claude-code",
    },
  });

  /** In-flight spawns, keyed repo#number, so racing clicks share one result. */
  const spawning = new Map<
    string,
    Promise<{ threadId: string | null; existing: boolean; reason: string | null }>
  >();

  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db as never);
  // gh-context is the one record of which threads belong to which pull
  // requests; this sweep reads and writes its own links through it.
  const threadLinks = createThreadLinksBridge(bb);
  // The move out of this plugin's own old tables writes through a wrapper with
  // no hook, so the hook below cannot wait on itself.
  const legacyLinks = createSweepLinks(threadLinks, bb.pluginId, "pull");
  const links = createSweepLinks(threadLinks, bb.pluginId, "pull", {
    before: () => ensureLegacyMoved(),
  });

  /**
   * Finishes the one-time move of links this checkout kept before gh-context,
   * ahead of anything that reads or writes links. Concurrent callers share one
   * move; once the old tables are gone this is a flag check.
   */
  let legacyMoved = false;
  let legacyMove: Promise<void> | null = null;
  async function ensureLegacyMoved(): Promise<void> {
    if (legacyMoved) return;
    legacyMove ??= moveLegacyThreadLinks()
      .then(() => {
        legacyMoved = true;
      })
      .finally(() => {
        legacyMove = null;
      });
    await legacyMove;
  }

  /**
   * Drops links whose thread no longer exists or has been archived.
   *
   * The thread.deleted / thread.archived handlers below cover the live case, but
   * lifecycle events only fire while this plugin is loaded. A thread deleted
   * while bb was stopped would otherwise stay linked forever, leaving the row
   * offering to open a thread that is gone. Reconciling on every sweep makes the
   * link self-healing rather than dependent on having witnessed the event.
   */
  async function reconcileThreadLinks(): Promise<void> {
    const rows = store.readRows();
    if (rows.length === 0) return;
    const linked = [...new Set([...(await links.threadMap(rows)).values()].flat())];
    if (linked.length === 0) return;

    const live = new Set<string>();
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const threads = await bb.sdk.threads.list({
        originPluginId: bb.pluginId,
        includeHidden: true,
        archived: false,
        limit: pageSize,
        offset,
      });
      for (const thread of threads) live.add(thread.id);
      if (threads.length < pageSize) break;
    }

    let dropped = 0;
    for (const threadId of linked) {
      if (!live.has(threadId)) {
        await links.release(threadId);
        dropped += 1;
      }
    }
    if (dropped > 0) bb.log.info(`released ${dropped} review(s) from missing threads`);
  }

  /**
   * Moves the links this checkout recorded before gh-context existed into it,
   * once, then drops the table that held them. Every one was a thread this
   * plugin started: it never adopted threads from the composer.
   */
  async function moveLegacyThreadLinks(): Promise<void> {
    const legacy = store.legacyThreadLinks();
    for (const link of legacy) {
      await legacyLinks.link(link.repo, link.number, link.threadId, "spawned");
    }
    if (legacy.length > 0) bb.log.info(`moved ${legacy.length} thread link(s) into gh-context`);
    store.dropLegacyThreadLinks();
  }

  /**
   * Consecutive sweeps that found no gh-context. One is gh-context still
   * loading after a restart; a run of them is a missing plugin, and
   * needs-configuration is one-way until reload, so it waits for the run.
   */
  let linksUnavailableRuns = 0;

  async function linksAvailable(): Promise<boolean> {
    if (await threadLinks.available()) {
      linksUnavailableRuns = 0;
      return true;
    }
    linksUnavailableRuns += 1;
    bb.log.warn(`gh-context unavailable (${linksUnavailableRuns} in a row)`);
    if (linksUnavailableRuns >= UNAVAILABLE_RUNS_BEFORE_CONFIG) {
      bb.status.needsConfiguration(GH_CONTEXT_REQUIRED);
    }
    return false;
  }

  /**
   * Consecutive sweeps that could not reach gh, and how many it takes before
   * the plugin declares itself misconfigured. Three at the default interval is
   * about fifteen minutes of consistent failure.
   */
  let unavailableRuns = 0;
  const UNAVAILABLE_RUNS_BEFORE_CONFIG = 3;

  async function sweepNow(): Promise<{ ok: boolean; error: string | null }> {
    const outcome = await fetchAndStore();

    // Reconciliation runs whether or not gh succeeded: a missing gh says
    // nothing about whether a linked thread still exists, and a row stuck on
    // "Open thread" for a deleted thread should heal even while the sweep
    // itself is broken.
    if (await linksAvailable()) {
      try {
        await ensureLegacyMoved();
      } catch (error) {
        bb.log.warn(`could not move thread links into gh-context: ${String(error)}`);
      }
      try {
        await reconcileThreadLinks();
      } catch (error) {
        bb.log.warn(`could not reconcile thread links: ${String(error)}`);
      }
    }

    // Expired deadlines are already ignored on read; this is only so the table
    // does not accumulate a row per review ever deferred.
    const pruned = store.pruneSnoozes(Date.now());
    if (pruned > 0) bb.log.info(`${pruned} ignored review(s) came back`);

    return outcome;
  }

  /**
   * The repository filter for one sweep, rebuilt each time so a project added
   * since the last sweep is picked up without a reload.
   *
   * A failure to resolve projects leaves the filter unscoped rather than
   * empty: an unreachable project list is not evidence that nothing is checked
   * out here, and treating it as such would blank the panel over a blip.
   */
  async function repoFilter(): Promise<RepoFilter> {
    const { filterToProjects, extraRepositories } = await settings.get();
    if (filterToProjects !== "on") {
      return buildRepoFilter({ enabled: false, candidates: [], extras: "" });
    }
    try {
      return buildRepoFilter({
        enabled: true,
        candidates: await projectCandidates(),
        extras: extraRepositories,
      });
    } catch (error) {
      bb.log.warn(`could not resolve projects, showing every repository: ${String(error)}`);
      return buildRepoFilter({ enabled: false, candidates: [], extras: "" });
    }
  }

  async function fetchAndStore(): Promise<{ ok: boolean; error: string | null }> {
    const { ghPath } = await settings.get();
    try {
      const result = await runSweep(createGhRunner(ghPath), () => Date.now(), await repoFilter());
      store.replaceAll(result);
      bb.realtime.publish(REALTIME_CHANNEL, { sweptAt: result.sweptAt });
      bb.log.info(
        `swept ${result.rows.length} review request(s)` +
          (result.skippedRepos.length
            ? `, dropped ${result.skippedRepos.length} repo(s) outside this machine's projects` +
              ` (${result.skippedRepos.join(", ")})`
            : ""),
      );
      // Reset here, not just on the failure path: three failures spread over a
      // day are weather, and only an unbroken run means the configuration is
      // actually wrong.
      unavailableRuns = 0;
      return { ok: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.recordFailure(message);
      bb.realtime.publish(REALTIME_CHANNEL, { sweptAt: null });
      if (error instanceof GhUnavailableError) {
        // Always logged. This is the branch that can hide the plugin's panels,
        // so it must never be the silent one — the first time it fired, the
        // only evidence was the panels being gone.
        unavailableRuns += 1;
        bb.log.warn(
          `gh unavailable (${unavailableRuns} in a row): ${message} — ${error.detail}`,
        );
        // needs-configuration is one-way: the SDK clears it on the next load
        // and offers no way back at runtime, so one blip would hide the panels
        // until someone thought to reload. Only a run of failures is a
        // configuration problem; one is weather.
        if (unavailableRuns >= UNAVAILABLE_RUNS_BEFORE_CONFIG) {
          bb.status.needsConfiguration(message);
        }
      } else {
        bb.log.warn(`sweep failed: ${message}`);
      }
      return { ok: false, error: message };
    }
  }

  /**
   * Every project bb knows about here, with every remote its checkout has.
   *
   * ProjectResponse carries one `gitRemoteUrl`, which for a fork-and-upstream
   * checkout is the fork. Reading the checkout's git config as well is what
   * lets a repository be matched by the remote the pull requests are actually
   * against.
   */
  async function projectCandidates(): Promise<ProjectCandidate[]> {
    return toProjectCandidates(await bb.sdk.projects.list());
  }

  const harvest = createHarvestBridge(bb);

  /**
   * Harvest's contribution to the listing: whether the clock should render at
   * all, and which row it should be lit on.
   */
  async function harvestListingState() {
    if (!(await harvest.available())) return { available: false, running: null };
    return { available: true, running: await harvest.runningReference() };
  }

  bb.rpc.register(rpcContract, {
    harvestAssignments() {
      return harvest.assignments();
    },

    harvestTrackedHours({ externalId, groupId }) {
      return harvest.trackedHours({ externalId, groupId });
    },

    harvestLastSelection({ scope }) {
      return harvest.lastSelection({ scope });
    },

    harvestStartTimer(input) {
      return harvest.startTimer(input);
    },

    async harvestStopTimer(input) {
      await harvest.stopTimer(input);
      return null;
    },

    async listRows() {
      const meta = store.readMeta();
      const rows = store.readRows();
      const { staleAfterDays } = await settings.get();

      let candidates: ProjectCandidate[] = [];
      try {
        candidates = await projectCandidates();
      } catch (error) {
        bb.log.warn(`could not resolve projects: ${String(error)}`);
      }

      const spawnable = new Set(
        rows.map((row) => row.repo).filter((repo) => matchProjectForRepo(repo, candidates)),
      );
      // Without gh-context the rows cannot say which already have a thread, so
      // none offers to start one: a duplicate thread is the worse mistake.
      let threadMap: Map<string, string[]> | null = null;
      try {
        threadMap = await links.threadMap(rows);
      } catch (error) {
        bb.log.warn(`could not read thread links: ${String(error)}`);
      }
      const snoozes = store.snoozesUntil(Date.now());

      return {
        rows: rows.map((row) => ({
          ...row,
          canSpawn: threadMap !== null && spawnable.has(row.repo),
          threadId: threadMap?.get(`${row.repo}#${row.number}`)?.[0] ?? null,
          snoozedUntil: snoozes.get(`${row.repo}#${row.number}`) ?? null,
        })),
        sweptAt: meta.sweptAt,
        skippedRepos: meta.skippedRepos,
        truncated: meta.truncated,
        lastError: threadMap === null ? GH_CONTEXT_REQUIRED : meta.lastError,
        harvest: await harvestListingState(),
        staleAfterDays: parseStaleAfterDays(staleAfterDays),
      };
    },

    async refresh() {
      return sweepNow();
    },

    async archiveThread({ repo, number }) {
      const threadId = await links.threadFor(repo, number);
      if (!threadId) return { ok: false, reason: "That review has no thread." };

      await bb.sdk.threads.archive({ threadId });
      // The thread.archived handler unlinks too, but doing it here means the row
      // updates even if the event is lost.
      await links.release(threadId);
      bb.realtime.publish(REALTIME_CHANNEL, { sweptAt: null });
      bb.log.info(`archived ${threadId} for ${repo}#${number}`);
      return { ok: true, reason: null };
    },

    async snooze({ repo, number }) {
      const now = Date.now();
      const until = snoozeUntil(now);
      store.snooze(repo, number, until, now);
      bb.realtime.publish(REALTIME_CHANNEL, { sweptAt: null });
      bb.log.info(`ignoring ${repo}#${number} until ${new Date(until).toISOString()}`);
      return { until };
    },

    async unsnooze({ repo, number }) {
      store.unsnooze(repo, number);
      bb.realtime.publish(REALTIME_CHANNEL, { sweptAt: null });
      bb.log.info(`no longer ignoring ${repo}#${number}`);
      return { ok: true };
    },

    async reviewThisDraft({ repo, number }) {
      const existingThreadId = await links.threadFor(repo, number);
      if (existingThreadId) return { existingThreadId, reason: null, seed: null };

      const row = store
        .readRows()
        .find((entry) => entry.repo === repo && entry.number === number);
      if (!row) {
        return {
          existingThreadId: null,
          reason: "That review request is no longer in the sweep.",
          seed: null,
        };
      }

      const target = matchProjectTargetForRepo(repo, await projectCandidates());
      if (!target) {
        return {
          existingThreadId: null,
          reason: `No bb project is checked out for ${repo}.`,
          seed: null,
        };
      }

      const { providerId, model, permissionMode } = await settings.get();
      const chosenModel = model.trim();

      return {
        existingThreadId: null,
        reason: null,
        seed: {
          projectId: target.id,
          providerId: providerId || null,
          model: chosenModel || null,
          permissionMode: parsePermissionMode(permissionMode),
          prompt: buildPromptParts(row, Date.now()).body,
          preview: {
            title: row.title,
            number: row.number,
            url: row.url,
            meta: [row.repo, `by ${row.author}`, row.isDraft ? "draft" : null]
              .filter(Boolean)
              .join(" · "),
          },
          // A new worktree by default. A review is someone else's branch,
          // so the thread has nothing to land and every reason to stay out of
          // the main checkout while it reads. The composer still offers Work
          // locally and Existing worktree for the times that is not what you
          // want.
          environment: {
            type: "host",
            workspace: {
              type: "managed-worktree",
              baseBranch: { kind: "default" },
            },
            ...(target.hostId ? { hostId: target.hostId } : {}),
          } as const,
        },
      };
    },

    async reviewThisSubmit({ repo, number, request }) {
      const key = `${repo}#${number}`;

      // One thread per review, enforced on three levels: the durable link
      // below, this in-flight map for submits that race before the first spawn
      // returns, and a disabled button in the panel. The link alone is not
      // enough — two clicks a few hundred ms apart both read "no link yet".
      const inFlight = spawning.get(key);
      if (inFlight) return inFlight;

      const attempt = (async () => {
        const existingThreadId = await links.threadFor(repo, number);
        if (existingThreadId) {
          return { threadId: existingThreadId, existing: true, reason: null };
        }

        const row = store
          .readRows()
          .find((entry) => entry.repo === repo && entry.number === number);
        if (!row) {
          return {
            threadId: null,
            existing: false,
            reason: "That review request is no longer in the sweep.",
          };
        }

        // Everything the composer resolved — project, environment, provider,
        // model, reasoning, permission mode, execution provenance — is
        // forwarded untouched. Only the title is the plugin's business: the
        // composer has no field for one, and the sidebar should name the
        // review.
        // The composer only ever held the middle of the prompt, so the two
        // ends are put back here — including the no-posting rule, which is in
        // the trailer precisely because it must not depend on anyone leaving
        // it in the box. Its own items sit between them untouched, which is
        // what keeps any @-mention or attachment that was added.
        const parts = buildPromptParts(row, Date.now());
        const thread = await bb.sdk.threads.spawn({
          ...request,
          input: [
            { type: "text", text: headerItem(parts), mentions: [] },
            ...request.input,
            { type: "text", text: trailerItem(parts), mentions: [] },
          ],
          title: threadTitle(row.state, number, row.title),
        } as Parameters<typeof bb.sdk.threads.spawn>[0]);

        bb.log.info(`started ${thread.id} for ${key} in ${request.projectId}`);
        await links.link(repo, number, thread.id, "spawned");
        bb.realtime.publish(REALTIME_CHANNEL, { sweptAt: null });
        return { threadId: thread.id, existing: false, reason: null };
      })();

      spawning.set(key, attempt);
      try {
        return await attempt;
      } finally {
        spawning.delete(key);
      }
    },
  });

  // A thread the user archived or deleted should not keep its review pinned to
  // it, otherwise the row offers to open a thread that is gone.
  for (const event of ["thread.archived", "thread.deleted"] as const) {
    bb.events.on(event, async ({ thread }) => {
      try {
        await links.release(thread.id);
      } catch (error) {
        bb.log.warn(`could not release ${thread.id}: ${String(error)}`);
      }
      bb.realtime.publish(REALTIME_CHANNEL, { sweptAt: null });
    });
  }

  bb.background.service("sweep", {
    async start(signal) {
      while (!signal.aborted) {
        await sweepNow();
        if (signal.aborted) return;

        const { syncIntervalMinutes } = await settings.get();
        const delay = Number(syncIntervalMinutes) * 60_000;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
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
    },
  });
}

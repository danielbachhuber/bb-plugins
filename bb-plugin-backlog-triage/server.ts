/**
 * Backend for the backlog triage panel.
 *
 * The sweep decides what is true about an issue and never more than that. What
 * to do about one is decided by a spawned thread, which writes its proposal
 * back through `bb backlog-triage suggest`, and nothing reaches GitHub until a
 * click approves it.
 */

import { GhUnavailableError, createGhRunner, type GhRunner } from '@danielb/gh-shared/gh';
import { parseRemoteSlug } from '@danielb/gh-shared/projects';
import type { BbPluginApi } from '@get-bb/plugin-sdk';

import { pendingRows, unresearchedRows } from './triage/classify.js';
import { rpcContract } from './triage/contract.js';
import { applyDisposition, fetchOpenIssues, InvalidRepoError } from './triage/gh.js';
import { buildResearchPrompt } from './triage/prompt.js';
import { MIGRATIONS, createStore } from './triage/store.js';
import { actionClosesIssue, actionPostsComment, SUGGESTED_ACTIONS, type SuggestedAction } from './triage/types.js';

export { rpcContract };

const REALTIME_CHANNEL = 'triage-updated';

/** One transient `gh` failure must not latch the panel out of the sidebar. */
const FAILURES_BEFORE_UNCONFIGURED = 3;

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    ghPath: {
      type: 'string',
      label: 'Path to the gh CLI',
      default: 'gh',
    },
    syncIntervalMinutes: {
      type: 'select',
      label: 'Sync interval (minutes)',
      options: ['5', '15', '60'],
      default: '15',
    },
    batchSize: {
      type: 'select',
      label: 'Issues per research batch',
      options: ['5', '10', '20', '30'],
      default: '10',
    },
    providerId: {
      type: 'string',
      label: 'Provider for research threads',
      // Pinned rather than inherited: skills are provider-scoped, and a thread
      // that silently lands on another provider cannot resolve the ones this
      // prompt relies on.
      default: 'claude-code',
    },
    model: {
      type: 'string',
      label: 'Model for research threads',
      default: '',
    },
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db);

  let consecutiveFailures = 0;

  async function gh(): Promise<GhRunner> {
    const { ghPath } = await settings.get();
    return createGhRunner(ghPath || 'gh');
  }

  function describeError(error: unknown): string {
    if (error instanceof GhUnavailableError) return error.message;
    if (error instanceof InvalidRepoError) return error.message;
    return error instanceof Error ? error.message : String(error);
  }

  async function sweepRepo(repo: string): Promise<string | null> {
    try {
      const result = await fetchOpenIssues(await gh(), repo, new Date());
      store.replaceIssues(repo, result.rows);
      store.setMeta({
        repo,
        sweptAt: Date.now(),
        total: result.rows.length,
        truncated: result.truncated,
        lastError: null,
      });
      consecutiveFailures = 0;
      bb.realtime.publish(REALTIME_CHANNEL, { repo });
      bb.log.info(`swept ${repo}: ${result.rows.length} open issues`);
      return null;
    } catch (error) {
      const message = describeError(error);
      const previous = store.getMeta(repo);
      // The last good rows stay on screen with the error above them. A stale
      // list beats an empty one.
      store.setMeta({
        repo,
        sweptAt: previous?.sweptAt ?? null,
        total: previous?.total ?? 0,
        truncated: previous?.truncated ?? false,
        lastError: message,
      });
      if (error instanceof GhUnavailableError) {
        consecutiveFailures += 1;
        bb.log.warn(`sweep of ${repo} failed (${consecutiveFailures}/${FAILURES_BEFORE_UNCONFIGURED}): ${message}`);
        if (consecutiveFailures >= FAILURES_BEFORE_UNCONFIGURED) {
          bb.status.needsConfiguration(message);
        }
      } else {
        bb.log.warn(`sweep of ${repo} failed: ${message}`);
      }
      bb.realtime.publish(REALTIME_CHANNEL, { repo });
      return message;
    }
  }

  // ---------------------------------------------------------------- RPC

  bb.rpc.register(rpcContract, {
    async listRepos() {
      const swept = store.listRepos();
      try {
        return { swept, candidates: await checkedOutRepos(), error: null };
      } catch (error) {
        return { swept, candidates: [], error: describeError(error) };
      }
    },

    async selectedRepo() {
      return { repo: store.selectedRepo() };
    },

    async selectRepo({ repo }) {
      store.selectRepo(repo);
      // A repo enters the sweep rotation by being picked here.
      if (repo && !store.getMeta(repo)) await sweepRepo(repo);
      bb.realtime.publish(REALTIME_CHANNEL, { repo });
      return { repo: store.selectedRepo() };
    },

    async listRows({ repo }) {
      const rows = store.listRows(repo);
      const meta = store.getMeta(repo);
      const { batchSize } = await settings.get();
      return {
        repo,
        rows,
        sweptAt: meta?.sweptAt ?? null,
        total: meta?.total ?? rows.length,
        truncated: meta?.truncated ?? false,
        lastError: meta?.lastError ?? null,
        counts: {
          pending: pendingRows(rows).length,
          researched: rows.filter((r) => r.suggestion !== null && r.disposition.verdict === 'pending').length,
          approved: rows.filter((r) => r.disposition.verdict === 'approved').length,
          rejected: rows.filter((r) => r.disposition.verdict === 'rejected').length,
        },
        batchSize: Number.parseInt(batchSize, 10),
      };
    },

    async sync({ repo }) {
      const error = await sweepRepo(repo);
      return { ok: error === null, error };
    },

    async researchSeed({ repo, count }) {
      const candidates = unresearchedRows(store.listRows(repo)).slice(0, count);
      if (candidates.length === 0) {
        return { seed: null, numbers: [], reason: 'Every issue in this sweep already has a suggestion.' };
      }

      const project = await findProjectForRepo(repo);
      if (!project) {
        return {
          seed: null,
          numbers: [],
          reason: `No bb project on this machine has ${repo} as its remote, so there is nowhere to check the code.`,
        };
      }

      const { providerId, model } = await settings.get();
      return {
        seed: {
          projectId: project,
          providerId: providerId || null,
          model: model || null,
          permissionMode: 'accept-edits' as const,
          prompt: buildResearchPrompt(repo, candidates),
          environment: { type: 'project-default' as const },
        },
        numbers: candidates.map((r) => r.number),
        reason: null,
      };
    },

    async startResearch({ request, repo, numbers }) {
      try {
        const thread = await bb.sdk.threads.spawn({
          ...request,
          title: `Triage ${numbers.length} stale issue${numbers.length === 1 ? '' : 's'} in ${repo}`,
        } as Parameters<typeof bb.sdk.threads.spawn>[0]);
        store.recordBatch(thread.id, repo, numbers);
        bb.log.info(`started ${thread.id} to research ${numbers.length} issues in ${repo}`);
        bb.realtime.publish(REALTIME_CHANNEL, { repo });
        return { threadId: thread.id, reason: null };
      } catch (error) {
        // Surfaced rather than swallowed: a button that silently does nothing
        // is the failure mode this wrapper exists to prevent.
        const message = describeError(error);
        bb.log.warn(`could not start a research thread for ${repo}: ${message}`);
        return { threadId: null, reason: message };
      }
    },

    async approve({ repo, number, body }) {
      const row = store.getRow(repo, number);
      if (!row) return { ok: false, error: `#${number} is no longer in the sweep.` };
      if (!row.suggestion) return { ok: false, error: `#${number} has no suggestion to approve.` };

      const action = row.suggestion.action;
      const decidedAt = new Date().toISOString();
      try {
        await applyDisposition(await gh(), repo, number, {
          comment: actionPostsComment(action) ? body : null,
          close: actionClosesIssue(action),
        });
      } catch (error) {
        const message = describeError(error);
        store.putDisposition(repo, number, {
          ...row.disposition,
          verdict: 'pending',
          approvedBody: body,
          decidedAt,
          appliedAt: null,
          applyError: message,
        });
        bb.realtime.publish(REALTIME_CHANNEL, { repo });
        return { ok: false, error: message };
      }

      store.putDisposition(repo, number, {
        verdict: 'approved',
        rejectionReason: '',
        approvedBody: body,
        decidedAt,
        appliedAt: new Date().toISOString(),
        applyError: null,
      });
      bb.log.info(`approved ${action} on ${repo}#${number}`);
      bb.realtime.publish(REALTIME_CHANNEL, { repo });
      return { ok: true, error: null };
    },

    async reject({ repo, number, reason }) {
      const row = store.getRow(repo, number);
      if (!row) return { ok: false, error: `#${number} is no longer in the sweep.` };
      store.putDisposition(repo, number, {
        ...row.disposition,
        verdict: 'rejected',
        rejectionReason: reason,
        decidedAt: new Date().toISOString(),
        appliedAt: null,
        applyError: null,
      });
      bb.realtime.publish(REALTIME_CHANNEL, { repo });
      return { ok: true, error: null };
    },
  });

  /** The bb project whose git remote is this repo, or null. */
  async function findProjectForRepo(repo: string): Promise<string | null> {
    try {
      for (const project of await bb.sdk.projects.list()) {
        if (project.gitRemoteUrl && parseRemoteSlug(project.gitRemoteUrl) === repo) return project.id;
      }
    } catch (error) {
      bb.log.warn(`could not resolve projects: ${String(error)}`);
    }
    return null;
  }

  /**
   * Repositories a bb project on this machine has checked out.
   *
   * Not every repo the account can see: researching an issue means reading the
   * code it refers to, so a repo with no checkout here is one this panel could
   * never finish a pass on.
   */
  async function checkedOutRepos(): Promise<string[]> {
    const slugs = new Set<string>();
    for (const project of await bb.sdk.projects.list()) {
      const slug = project.gitRemoteUrl ? parseRemoteSlug(project.gitRemoteUrl) : null;
      if (slug) slugs.add(slug);
    }
    return [...slugs].sort();
  }

  // ---------------------------------------------------------------- CLI

  bb.cli.register({
    name: 'backlog-triage',
    summary: 'Record a triage suggestion for a stale GitHub issue',
    commands: [
      {
        name: 'suggest',
        summary: 'Propose what should happen to one issue, for review in the panel',
        usage:
          'bb backlog-triage suggest <number> --repo <owner/name> --action close|comment|keep|needsInfo --rationale <text> [--body <text>]',
      },
      {
        name: 'list',
        summary: 'List the issues in the batch this thread was started for',
        usage: 'bb backlog-triage list [--repo <owner/name>]',
      },
    ],
    async run(argv, ctx) {
      const [command, ...rest] = argv;
      if (command === 'suggest') return runSuggest(rest, ctx.threadId ?? null);
      if (command === 'list') return runList(rest, ctx.threadId ?? null);
      return {
        exitCode: 1,
        stderr: `Unknown command "${command ?? ''}". Try: bb backlog-triage suggest --help`,
      };
    },
  });

  function parseFlags(argv: string[]): { positional: string[]; flags: Record<string, string> } {
    const positional: string[] = [];
    const flags: Record<string, string> = {};
    for (let i = 0; i < argv.length; i += 1) {
      const token = argv[i];
      if (token.startsWith('--')) {
        const eq = token.indexOf('=');
        if (eq !== -1) {
          flags[token.slice(2, eq)] = token.slice(eq + 1);
        } else {
          flags[token.slice(2)] = argv[i + 1] ?? '';
          i += 1;
        }
      } else {
        positional.push(token);
      }
    }
    return { positional, flags };
  }

  /** The repo a thread is working, from its recorded batch or an explicit flag. */
  function resolveRepo(flags: Record<string, string>, threadId: string | null): string | null {
    if (flags.repo) return flags.repo;
    if (threadId) return store.batchNumbers(threadId)?.repo ?? null;
    return null;
  }

  function runSuggest(argv: string[], threadId: string | null) {
    const { positional, flags } = parseFlags(argv);
    const number = Number.parseInt(positional[0] ?? flags.number ?? '', 10);
    if (!Number.isInteger(number)) {
      return { exitCode: 1, stderr: 'An issue number is required: bb backlog-triage suggest 43 --action close ...' };
    }

    const repo = resolveRepo(flags, threadId);
    if (!repo) {
      return { exitCode: 1, stderr: 'Could not tell which repository this is for. Pass --repo <owner/name>.' };
    }

    const action = flags.action as SuggestedAction;
    if (!SUGGESTED_ACTIONS.includes(action)) {
      return { exitCode: 1, stderr: `--action must be one of: ${SUGGESTED_ACTIONS.join(', ')}` };
    }

    const body = flags.body ?? '';
    if (actionPostsComment(action) && body.trim().length === 0) {
      return { exitCode: 1, stderr: `--body is required for --action ${action}, which posts a comment.` };
    }

    const row = store.getRow(repo, number);
    if (!row) {
      return { exitCode: 1, stderr: `${repo}#${number} is not in the current sweep. Run a sync in the panel first.` };
    }

    store.putSuggestion(repo, number, {
      action,
      body,
      rationale: flags.rationale ?? '',
      suggestedAt: new Date().toISOString(),
      threadId,
    });
    bb.realtime.publish(REALTIME_CHANNEL, { repo });
    return { exitCode: 0, stdout: `Recorded ${action} for ${repo}#${number}. Awaiting review in the panel.` };
  }

  function runList(argv: string[], threadId: string | null) {
    const { flags } = parseFlags(argv);
    const repo = resolveRepo(flags, threadId);
    if (!repo) {
      return { exitCode: 1, stderr: 'Could not tell which repository this is for. Pass --repo <owner/name>.' };
    }
    const batch = threadId ? store.batchNumbers(threadId) : null;
    const rows = store.listRows(repo).filter((r) => (batch ? batch.numbers.includes(r.number) : r.suggestion === null));
    if (rows.length === 0) return { exitCode: 0, stdout: 'No issues in this batch.' };
    const lines = rows.map((r) => {
      const state = r.suggestion ? `suggested ${r.suggestion.action}` : 'awaiting a suggestion';
      return `#${r.number} ${r.title} (${r.staleness.idleDays}d idle, ${state})`;
    });
    return { exitCode: 0, stdout: lines.join('\n') };
  }

  // ------------------------------------------------------------ service

  bb.background.service('backlog-sweep', {
    async start(signal) {
      while (!signal.aborted) {
        // Only repos already in the store: a repo enters by being picked in
        // the panel, never by the service guessing at one.
        for (const repo of store.listRepos()) {
          if (signal.aborted) return;
          await sweepRepo(repo);
        }
        if (signal.aborted) return;

        const { syncIntervalMinutes } = await settings.get();
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, Number(syncIntervalMinutes) * 60_000);
          signal.addEventListener(
            'abort',
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

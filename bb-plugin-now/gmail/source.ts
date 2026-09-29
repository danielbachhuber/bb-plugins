// Gmail as a Now source: the threads matching one search, read through gws.
import type { GitHubRef } from "../github/notifications.js";
import type { GitHubState } from "../github/state.js";
import type { Source, SourceResult } from "../now/sources.js";
import { GwsMissingError, runJson, type GwsRunner } from "./gws.js";
import { fallbackDirs } from "../now/find-command.js";
import type { InviteState } from "../calendar/invite.js";
import { githubRefs, inboxItems, METADATA_HEADERS, needsBody, proposalAttachment } from "./inbox.js";
import { SOURCE_ID } from "./normalize.js";

export const DEFAULT_QUERY = "in:inbox";
export const DEFAULT_MAX_THREADS = 25;
/** The threads list endpoint's own ceiling. */
const MAX_THREADS_LIMIT = 500;
/** How many `threads get` runs go at once. Each is a process and an API call. */
const CONCURRENCY = 5;
const NAME = "Gmail";

/** Says where `command` was looked for, since bb's PATH is rarely the shell's. */
export function missingHint(command: string): string {
  const set = "`bb plugin config now set gwsPath <path>`";
  if (command.includes("/")) return `Could not find the gws CLI at \`${command}\`. Set its full path with ${set}.`;
  const dirs = fallbackDirs("~").map((dir) => `\`${dir}\``);
  return (
    `Could not find the \`${command}\` CLI on bb's PATH or in ${dirs.slice(0, -1).join(", ")}, or ${dirs.at(-1)}. ` +
    `Install it, or set its full path with ${set}.`
  );
}

export interface GmailSourceOptions {
  run: GwsRunner;
  query: string | undefined;
  maxThreads: number | undefined;
  /** The signed-in address, for links that open the right account. Null if unknown. */
  account: () => Promise<string | null>;
  /**
   * The current state of the pull requests and issues GitHub emailed about.
   * Optional, and allowed to fail: the rows then use the state the latest
   * email reported.
   */
  githubStates?: (refs: GitHubRef[]) => Promise<Map<string, GitHubState>>;
  /** Your reply to each invitation's event, and when each proposal's event is now, from Calendar. Optional, and allowed to fail. */
  inviteStates?: (eventIds: string[]) => Promise<Map<string, InviteState>>;
  onWarn?: (message: string) => void;
}

/** Run `task` over `values`, at most `limit` at a time, keeping their order. */
async function mapLimit<T, R>(values: readonly T[], limit: number, task: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await task(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function clampMax(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) return DEFAULT_MAX_THREADS;
  return Math.min(Math.trunc(value), MAX_THREADS_LIMIT);
}

export function gmailSource(options: GmailSourceOptions): Source {
  const query = options.query?.trim() || DEFAULT_QUERY;
  const maxThreads = clampMax(options.maxThreads);

  async function load(): Promise<SourceResult> {
    let listing: { threads?: unknown };
    try {
      listing = await runJson(options.run, [
        "gmail", "users", "threads", "list",
        "--params", JSON.stringify({ userId: "me", q: query, maxResults: maxThreads }),
      ]);
    } catch (error) {
      if (!(error instanceof GwsMissingError)) throw error;
      return { status: { id: SOURCE_ID, name: NAME, state: "unconfigured", hint: missingHint(error.command) }, items: [] };
    }

    const ids = (Array.isArray(listing.threads) ? listing.threads : [])
      .map((thread) => (typeof thread === "object" && thread !== null ? (thread as { id?: unknown }).id : null))
      .filter((id): id is string => typeof id === "string");

    const [account, threads] = await Promise.all([
      options.account(),
      mapLimit(ids, CONCURRENCY, (id) =>
        runJson<unknown>(options.run, [
          "gmail", "users", "threads", "get",
          "--params",
          JSON.stringify({ userId: "me", id, format: "metadata", metadataHeaders: METADATA_HEADERS }),
        ]),
      ),
    ]);

    // Google's comment notifications say who wrote what only in their bodies,
    // and an invitation or a proposal names its event only there, so those threads, and
    // only those, are fetched again in full.
    await mapLimit(
      threads.map((thread, index) => ({ thread, index })).filter(({ thread }) => needsBody(thread)),
      CONCURRENCY,
      async ({ thread, index }) => {
        try {
          threads[index] = await runJson<unknown>(options.run, [
            "gmail", "users", "threads", "get",
            "--params", JSON.stringify({ userId: "me", id: (thread as { id: string }).id, format: "full" }),
          ]);
        } catch (error) {
          options.onWarn?.(`Could not read an email in full: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    );

    // A proposal's time is only in its invite.ics, which Gmail leaves out of
    // the full thread as an attachment, so that one part is fetched as well.
    await mapLimit(
      threads.flatMap((thread) => {
        const found = proposalAttachment(thread);
        return found === null ? [] : [found];
      }),
      CONCURRENCY,
      async ({ messageId, part, attachmentId }) => {
        try {
          const attachment = await runJson<{ data?: unknown }>(options.run, [
            "gmail", "users", "messages", "attachments", "get",
            "--params", JSON.stringify({ userId: "me", messageId, id: attachmentId }),
          ]);
          if (typeof attachment.data === "string") part.body = { ...(part.body as object), data: attachment.data };
        } catch (error) {
          options.onWarn?.(`Could not read a proposed time: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    );

    const refs = githubRefs(threads);
    let states = new Map<string, GitHubState>();
    if (refs.length > 0 && options.githubStates !== undefined) {
      try {
        states = await options.githubStates(refs);
      } catch (error) {
        options.onWarn?.(`Could not look up GitHub states: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    let items = inboxItems(threads, account, states);

    const eventIds = [
      ...new Set(items.flatMap((item) => [item.invite?.eventId, item.proposal?.eventId].filter((id): id is string => !!id))),
    ];
    if (eventIds.length > 0 && options.inviteStates !== undefined) {
      try {
        const replies = await options.inviteStates(eventIds);
        items = items.map((item) => {
          if (item.proposal?.eventId) {
            const state = replies.get(item.proposal.eventId);
            return state === undefined ? item : { ...item, proposal: { ...item.proposal, current: state.time, cancelled: state.cancelled } };
          }
          const state = item.invite?.eventId ? replies.get(item.invite.eventId) : undefined;
          if (state === undefined || !item.invite) return item;
          return { ...item, invite: { ...item.invite, response: state.response, cancelled: item.invite.cancelled || state.cancelled } };
        });
      } catch (error) {
        options.onWarn?.(`Could not look up invitations: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { status: { id: SOURCE_ID, name: NAME, state: "ok", query, count: items.length }, items };
  }

  return { id: SOURCE_ID, name: NAME, query, load };
}

/**
 * The signed-in address, asked for once and then remembered: it changes only
 * when someone signs gws into another account, and a reload picks that up.
 * A failure is not remembered, and falls back to links without an account.
 */
export function rememberedAccount(run: GwsRunner): () => Promise<string | null> {
  let known: string | null = null;
  return async () => {
    if (known !== null) return known;
    try {
      const profile = await runJson<{ emailAddress?: unknown }>(run, [
        "gmail", "users", "getProfile", "--params", JSON.stringify({ userId: "me" }),
      ]);
      if (typeof profile.emailAddress === "string") known = profile.emailAddress;
    } catch {}
    return known;
  };
}

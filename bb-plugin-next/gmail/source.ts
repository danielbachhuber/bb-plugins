// Gmail as a Next source: the threads matching one search, read through gws.
import type { Source, SourceResult } from "../next/sources.js";
import type { Item } from "../next/types.js";
import { GwsMissingError, runJson, type GwsRunner } from "./gws.js";
import { normalizeThread, SOURCE_ID } from "./normalize.js";

export const DEFAULT_QUERY = "in:inbox";
export const DEFAULT_MAX_THREADS = 25;
/** The threads list endpoint's own ceiling. */
const MAX_THREADS_LIMIT = 500;
/** How many `threads get` runs go at once. Each is a process and an API call. */
const CONCURRENCY = 5;
const NAME = "Gmail";

export const MISSING_HINT =
  "Install the `gws` CLI and sign in with `gws auth login`, or point `gwsPath` at it with " +
  "`bb plugin config next set gwsPath <path>`.";

export interface GmailSourceOptions {
  run: GwsRunner;
  query: string | undefined;
  maxThreads: number | undefined;
  /** The signed-in address, for links that open the right account. Null if unknown. */
  account: () => Promise<string | null>;
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
      return { status: { id: SOURCE_ID, name: NAME, state: "unconfigured", hint: MISSING_HINT }, items: [] };
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
          JSON.stringify({ userId: "me", id, format: "metadata", metadataHeaders: ["From", "Subject"] }),
        ]),
      ),
    ]);

    const items = threads
      .map((thread) => normalizeThread(thread, account))
      .filter((item): item is Item => item !== null);

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

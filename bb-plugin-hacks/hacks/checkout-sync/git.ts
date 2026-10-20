// The git boundary, run by the plugin's server: reading a checkout's position
// against its upstream, fetching, and fast-forwarding.
//
// Everything is per checkout path. Several windows poll the same checkouts,
// so fetches are shared while in flight and spaced at least FETCH_EVERY_MS
// apart.
import { execFile } from "node:child_process";
import {
  canFastForward,
  parseAheadBehind,
  summarizeError,
  type CheckoutStatus,
} from "./rules";

/** Runs git in `cwd` and resolves with its stdout, or rejects with its stderr. */
export type RunGit = (cwd: string, args: string[]) => Promise<string>;

/** How old the last fetch can be before a status read fetches again. */
export const FETCH_EVERY_MS = 5 * 60_000;

const GIT_TIMEOUT_MS = 60_000;

export const runGit: RunGit = (cwd, args) =>
  new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        // Never stop to ask for a password: a fetch that needs one fails.
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || error.message)));
        else resolve(String(stdout));
      },
    );
  });

export interface CheckoutSync {
  /** The checkout's status, fetching first when the last fetch is stale. */
  status(path: string): Promise<CheckoutStatus | null>;
  /** Fetches now, then fast-forwards when the branch is only behind. */
  pull(path: string): Promise<CheckoutStatus | null>;
}

export function createCheckoutSync(
  git: RunGit,
  now: () => number = Date.now,
  /** Where a background fetch failure goes, since the sidebar does not show it. */
  warn: (message: string) => void = () => {},
): CheckoutSync {
  const fetchedAt = new Map<string, number>();
  const fetching = new Map<string, Promise<string | null>>();
  // Failures from a click only. A background fetch that fails, such as one
  // racing another process's push in the same checkout, is logged and tried
  // again on the next interval rather than drawn as a failure nobody asked about.
  const errors = new Map<string, string>();

  async function read(path: string): Promise<CheckoutStatus | null> {
    let branch: string;
    let upstream: string;
    try {
      branch = (await git(path, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
      upstream = (
        await git(path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
      ).trim();
    } catch {
      // Detached, not a repository, or tracking nothing: nothing to compare.
      return null;
    }
    const counts = parseAheadBehind(
      await git(path, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
    );
    if (counts === null) return null;
    return { branch, upstream, ...counts, error: errors.get(path) ?? null };
  }

  /** Fetches, sharing a fetch already in flight. Resolves with its error, if any. */
  function fetchUpstream(path: string): Promise<string | null> {
    const inFlight = fetching.get(path);
    if (inFlight) return inFlight;
    const run = git(path, ["fetch", "--quiet"])
      .then(() => {
        errors.delete(path);
        return null;
      })
      .catch((error: unknown) =>
        summarizeError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => {
        fetchedAt.set(path, now());
        fetching.delete(path);
      });
    fetching.set(path, run);
    return run;
  }

  return {
    async status(path) {
      const last = fetchedAt.get(path);
      if (last === undefined || now() - last >= FETCH_EVERY_MS) {
        // Only a checkout that tracks something is worth fetching.
        if ((await read(path)) === null) return null;
        const error = await fetchUpstream(path);
        if (error !== null) warn(`fetch failed in ${path}: ${error}`);
      }
      return read(path);
    },

    async pull(path) {
      const fetchError = await fetchUpstream(path);
      if (fetchError !== null) errors.set(path, fetchError);
      const status = await read(path);
      if (status === null || status.error !== null || !canFastForward(status)) return status;
      try {
        await git(path, ["merge", "--ff-only", "--quiet", "@{upstream}"]);
        errors.delete(path);
      } catch (error) {
        errors.set(path, summarizeError(error instanceof Error ? error.message : String(error)));
      }
      return read(path);
    },
  };
}

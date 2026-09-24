// The one module that runs the gh CLI.
import { execFile } from "node:child_process";

import type { GitHubRef } from "./notifications.js";
import { buildStateQuery, parseStateResponse, type GitHubState, type MergeMethod } from "./state.js";

/** Runs `gh` with arguments and resolves to its stdout. */
export type GhRunner = (args: string[]) => Promise<string>;

/** gh is not installed, or not where the ghPath setting points. */
export class GhMissingError extends Error {
  constructor(readonly command: string) {
    super(`Could not find \`${command}\`.`);
    this.name = "GhMissingError";
  }
}

const TIMEOUT_MS = 30_000;

export function createGhRunner(command: string): GhRunner {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(command, args, { maxBuffer: 16 * 1024 * 1024, timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
        if (error === null) return resolve(stdout);
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return reject(new GhMissingError(command));
        const detail = String(stderr).trim().split("\n").find((line) => line.trim() !== "");
        reject(Object.assign(new Error(detail ?? error.message), { stdout: String(stdout) }));
      });
    });
}

/**
 * The current state of each reference, in one request. gh answers a query
 * that mentions a repository you cannot see with an error and partial data,
 * so the partial data is still read.
 */
export async function fetchStates(run: GhRunner, refs: readonly GitHubRef[]): Promise<Map<string, GitHubState>> {
  const { query, aliases } = buildStateQuery(refs);
  if (query === "") return new Map();

  let stdout: string;
  try {
    stdout = await run(["api", "graphql", "-f", `query=${query}`]);
  } catch (error) {
    // `gh api` exits non-zero on a partial error but still prints the body.
    const body = (error as { stdout?: unknown }).stdout;
    if (typeof body !== "string" || !body.trim().startsWith("{")) throw error;
    stdout = body;
  }
  return parseStateResponse(JSON.parse(stdout), aliases);
}

/**
 * Merges a pull request, as you, with the method given. Where the repository
 * uses a merge queue, gh adds it to the queue instead.
 */
export async function mergePullRequest(run: GhRunner, ref: GitHubRef, method: MergeMethod): Promise<void> {
  await run(["pr", "merge", String(ref.number), "--repo", ref.repo, `--${method}`]);
}

/** Comments on a pull request or issue, as you. Resolves to the comment's URL. */
export async function postComment(run: GhRunner, ref: GitHubRef, body: string): Promise<string> {
  const stdout = await run([
    "api",
    `repos/${ref.repo}/issues/${ref.number}/comments`,
    "--method", "POST",
    "-f", `body=${body}`,
    "--jq", ".html_url",
  ]);
  return stdout.trim();
}

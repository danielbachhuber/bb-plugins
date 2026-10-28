// The one place this plugin reaches GitHub: GraphQL through the gh CLI.
import type { GhRunner } from "@danielb/gh-shared/gh";

import type { GraphqlQuery } from "./sync.js";

/** How often a call GitHub answered with a 5xx is tried again, and how long to wait first. */
const RETRIES = 2;
const RETRY_DELAY_MS = 3_000;

/** What gh wrote to stderr, which names the failure; its message is mostly the argv. */
function ghStderr(error: unknown): string {
  const stderr = (error as { stderr?: unknown })?.stderr;
  return typeof stderr === "string" ? stderr.trim() : "";
}

/**
 * Runs a query with `gh api graphql`. Strings go as `-f` so a value like
 * "0123" stays a string; numbers go as `-F`, which gh sends as JSON numbers.
 * A null variable is left out, which GraphQL reads as null.
 *
 * GitHub sometimes answers a heavy page with a 502 or 504 and then serves the
 * same page on the next try, so a 5xx is tried again before the sync stops.
 * A call that still fails throws gh's own short error rather than the whole
 * command line.
 */
export function ghGraphql(
  runner: GhRunner,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): GraphqlQuery {
  return async (query, variables) => {
    const args = ["api", "graphql", "-f", `query=${query}`];
    for (const [name, value] of Object.entries(variables)) {
      if (value === null) continue;
      args.push(typeof value === "number" ? "-F" : "-f", `${name}=${value}`);
    }
    let raw: string;
    for (let attempt = 0; ; attempt += 1) {
      try {
        raw = await runner.run(args);
        break;
      } catch (error) {
        const stderr = ghStderr(error);
        if (stderr === "") throw error;
        if (/HTTP 5\d\d/.test(stderr) && attempt < RETRIES) {
          await wait(RETRY_DELAY_MS);
          continue;
        }
        throw new Error(`GitHub answered ${stderr.replace(/^gh: /, "")}`, { cause: error });
      }
    }
    const response = JSON.parse(raw) as { data?: unknown; errors?: Array<{ message: string }> };
    if (response.errors?.length) throw new Error(response.errors.map((error) => error.message).join("; "));
    return response.data;
  };
}

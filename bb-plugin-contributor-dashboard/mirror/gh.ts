// The one place this plugin reaches GitHub: GraphQL through the gh CLI.
import type { GhRunner } from "@danielb/gh-shared/gh";

import type { GraphqlQuery } from "./sync.js";

/**
 * Runs a query with `gh api graphql`. Strings go as `-f` so a value like
 * "0123" stays a string; numbers go as `-F`, which gh sends as JSON numbers.
 * A null variable is left out, which GraphQL reads as null.
 */
export function ghGraphql(runner: GhRunner): GraphqlQuery {
  return async (query, variables) => {
    const args = ["api", "graphql", "-f", `query=${query}`];
    for (const [name, value] of Object.entries(variables)) {
      if (value === null) continue;
      args.push(typeof value === "number" ? "-F" : "-f", `${name}=${value}`);
    }
    const response = JSON.parse(await runner.run(args)) as { data?: unknown; errors?: Array<{ message: string }> };
    if (response.errors?.length) throw new Error(response.errors.map((error) => error.message).join("; "));
    return response.data;
  };
}

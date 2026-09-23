/**
 * An in-memory gh-context for the sweeps' tests, exported as
 * `bb-plugin-gh-context/links/testing`.
 *
 * It answers `bb.sdk.plugins.callRpc` the way gh-context's server does for the
 * bridge's methods, and says every other plugin is missing, so Harvest reads
 * as not installed. `links` is the table itself, for a test to seed a link
 * gh-context would have found in a prompt, or to read what a sweep recorded.
 */

export interface FakeLink {
  threadId: string;
  repo: string;
  kind: "issue" | "pull";
  number: number;
  source: string;
}

interface CallRpcArgs {
  pluginId: string;
  method: string;
  input?: unknown;
  outputSchema?: { parse(value: unknown): unknown };
}

export interface FakeGhContext {
  links: FakeLink[];
  /** Makes the next calls behave as if gh-context were not installed. */
  setAvailable(available: boolean): void;
  callRpc(args: CallRpcArgs): Promise<never>;
}

export function createFakeGhContext(): FakeGhContext {
  const links: FakeLink[] = [];
  let available = true;

  function answer(method: string, input: Record<string, unknown>): unknown {
    switch (method) {
      case "linkThread": {
        const link = { ...(input as unknown as FakeLink), repo: String(input.repo).toLowerCase() };
        const exists = links.some(
          (entry) =>
            entry.threadId === link.threadId &&
            entry.repo === link.repo &&
            entry.kind === link.kind &&
            entry.number === link.number &&
            entry.source === link.source,
        );
        if (!exists) links.push(link);
        return null;
      }
      case "unlinkThread": {
        for (let index = links.length - 1; index >= 0; index -= 1) {
          const entry = links[index]!;
          if (entry.threadId === input.threadId && (input.source === undefined || entry.source === input.source)) {
            links.splice(index, 1);
          }
        }
        return null;
      }
      case "threadsForItems":
        return (input.items as Array<{ repo: string; kind: "issue" | "pull"; number: number }>).map((item) => {
          const repo = item.repo.toLowerCase();
          return {
            repo,
            kind: item.kind,
            number: item.number,
            threads: links
              .filter((entry) => entry.repo === repo && entry.kind === item.kind && entry.number === item.number)
              .map(({ threadId, source }) => ({ threadId, source })),
          };
        });
      case "itemsForThread":
        return links
          .filter((entry) => entry.threadId === input.threadId)
          .map(({ repo, kind, number, source }) => ({ repo, kind, number, source }));
      default:
        throw new Error(`gh-context has no method ${method}`);
    }
  }

  return {
    links,
    setAvailable(value) {
      available = value;
    },
    async callRpc({ pluginId, method, input, outputSchema }) {
      if (pluginId !== "gh-context" || !available) throw new Error(`plugin ${pluginId} is not installed`);
      const result = answer(method, (input ?? {}) as Record<string, unknown>);
      return (outputSchema ? outputSchema.parse(result) : result) as never;
    },
  };
}

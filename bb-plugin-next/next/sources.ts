// What a source is, and loading every source into one list.
import type { NextList, SourceStatus } from "./contract.js";
import { mergeItems } from "./items.js";
import type { Item } from "./types.js";

export interface SourceResult {
  status: SourceStatus;
  items: Item[];
}

export interface Source {
  id: string;
  name: string;
  /** What the source will be asked for, reported back when the load fails. */
  query: string | null;
  load(): Promise<SourceResult>;
}

/** A source that has not been set up, and so is never loaded. */
export function unconfiguredSource(id: string, name: string, hint: string): Source {
  return {
    id,
    name,
    query: null,
    load: async () => ({ status: { id, name, state: "unconfigured", hint }, items: [] }),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Load every source at once. One failing source reports its error and leaves
 * the others' items in the list.
 */
export async function loadSources(
  sources: readonly Source[],
  now: Date,
  onError: (source: Source, message: string) => void = () => {},
): Promise<NextList> {
  const results = await Promise.all(
    sources.map(async (source): Promise<SourceResult> => {
      try {
        return await source.load();
      } catch (error) {
        const message = messageOf(error);
        onError(source, message);
        return {
          status: { id: source.id, name: source.name, state: "error", query: source.query, message, kept: 0 },
          items: [],
        };
      }
    }),
  );

  return {
    items: mergeItems(results.map((result) => result.items)),
    sources: results.map((result) => result.status),
    fetchedAt: now.toISOString(),
  };
}

/**
 * Put back the last good items of each source that failed this time. An
 * expired sign-in should leave yesterday's emails on the page with an error
 * above them, not empty the list; each failed source says how many it kept.
 */
export function keepFailedSources(previous: NextList | null, next: NextList): NextList {
  if (previous === null) return next;

  const failed = new Set(next.sources.filter((source) => source.state === "error").map((source) => source.id));
  if (failed.size === 0) return next;

  const kept = previous.items.filter((item) => failed.has(item.source));
  if (kept.length === 0) return next;

  return {
    ...next,
    items: mergeItems([next.items, kept]),
    sources: next.sources.map((source) =>
      source.state === "error"
        ? { ...source, kept: kept.filter((item) => item.source === source.id).length }
        : source,
    ),
  };
}

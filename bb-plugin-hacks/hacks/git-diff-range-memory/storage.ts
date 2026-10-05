// Where each thread's range is kept: one localStorage key holding a JSON map
// from thread id to the range's value.
//
// localStorage rather than the plugin's server-side storage because the read
// happens on every thread switch, and an async round trip there would show
// "All changes" first and then jump.
import { ALL_CHANGES } from "./rules";

export const RANGES_KEY = "bb-plugin-hacks.gitDiffRange.byThread";

/**
 * How many threads are remembered. The oldest choice is dropped past this, so
 * the key does not grow for as long as the app is used.
 */
export const MAX_THREADS = 200;

interface StoredRange {
  value: string;
  at: number;
}

/**
 * The window bits this store needs. It is a structural type rather than
 * `Window` so a test can inject an in-memory Storage: under Node 26, Node's
 * own unavailable `localStorage` global shadows jsdom's.
 */
export interface RangeStorageHost {
  localStorage: Pick<Storage, "getItem" | "setItem">;
}

export interface RangeStore {
  get(threadId: string): string | undefined;
  /** Records a choice. "All changes" is bb's default, so it clears the entry. */
  set(threadId: string, value: string): void;
}

function parse(raw: string | null): Record<string, StoredRange> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    const ranges: Record<string, StoredRange> = {};
    for (const [threadId, entry] of Object.entries(parsed)) {
      if (
        entry !== null &&
        typeof entry === "object" &&
        typeof entry.value === "string" &&
        typeof entry.at === "number"
      ) {
        ranges[threadId] = { value: entry.value, at: entry.at };
      }
    }
    return ranges;
  } catch {
    return {};
  }
}

export function createLocalStorageRangeStore(
  host: RangeStorageHost,
  now: () => number = Date.now,
): RangeStore {
  // localStorage throws rather than returning null in a partitioned or
  // storage-disabled context, and a hack that throws on mount would take the
  // app's content-script generation down with it.
  const read = (): Record<string, StoredRange> => {
    try {
      return parse(host.localStorage.getItem(RANGES_KEY));
    } catch {
      return {};
    }
  };

  return {
    get(threadId) {
      return read()[threadId]?.value;
    },
    set(threadId, value) {
      const ranges = read();
      delete ranges[threadId];
      if (value !== ALL_CHANGES) {
        ranges[threadId] = { value, at: now() };
      }
      const kept = Object.entries(ranges)
        .sort(([, a], [, b]) => b.at - a.at)
        .slice(0, MAX_THREADS);
      try {
        host.localStorage.setItem(
          RANGES_KEY,
          JSON.stringify(Object.fromEntries(kept)),
        );
      } catch {
        // A range that cannot be stored is not worth failing a mount for.
      }
    },
  };
}

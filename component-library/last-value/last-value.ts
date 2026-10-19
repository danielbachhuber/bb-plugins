// The last value a page read from its server, kept in `localStorage` so the
// page can draw it at once on the next open while the fresh read runs.
import { useCallback, useState } from "react";

/**
 * Which build of the page kept a value. bb loads a plugin's frontend as one
 * bundle at `app.js?h=<hash of its contents>`, so once bundled this URL
 * changes whenever the page's code does, and a value kept by an older build
 * is dropped rather than drawn in a shape the page may no longer expect.
 */
const BUILD = import.meta.url;

interface Stored<T> {
  version: string;
  value: T;
}

/** `localStorage`, or nothing where it is unavailable (a storage-blocked tab). */
function store(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** The value kept under `key`, or null when there is none or another build kept it. */
export function readLastValue<T>(key: string, version: string = BUILD): T | null {
  try {
    const raw = store()?.getItem(key);
    if (raw == null) return null;
    const stored = JSON.parse(raw) as Partial<Stored<T>> | null;
    if (stored === null || typeof stored !== "object" || stored.version !== version || !("value" in stored)) {
      return null;
    }
    return stored.value ?? null;
  } catch {
    return null;
  }
}

export function writeLastValue<T>(key: string, value: T, version: string = BUILD): void {
  try {
    store()?.setItem(key, JSON.stringify({ version, value } satisfies Stored<T>));
  } catch {
    // Full or blocked storage: the next open waits for the read instead.
  }
}

/**
 * State that starts from the value kept under `key`, and keeps each value it
 * is given for the next mount. Name the key for the plugin, such as
 * `bb-plugin-pr-sweep:listing`, since every plugin shares one `localStorage`.
 */
export function useLastValue<T>(key: string): [T | null, (next: T) => void] {
  const [value, setValue] = useState<T | null>(() => readLastValue<T>(key));
  const keep = useCallback(
    (next: T) => {
      writeLastValue(key, next);
      setValue(next);
    },
    [key],
  );
  return [value, keep];
}

// Where the preferences are kept: two localStorage keys, in exactly the shape
// bb would use itself.
//
// The keys and their values are taken from get-bb/bb#3271, which adds these
// same preferences to bb proper. If that lands, bb reads the values this hack
// has been writing and the handoff costs nothing; until it does, the hack is
// the only writer. That forward compatibility is the whole reason this is
// localStorage rather than the plugin's own server-side storage, which would
// also cost an async round trip on mount and flash the wrong mode.
//
// bb stores these as raw strings, not JSON, and an absent key means "never
// chosen" — see createNullableLocalStorageEnumStorage in bb's
// apps/app/src/lib/browser-storage.ts.
import type { ToolbarPrefs, ViewMode } from "./prefs";

export const DISPLAY_MODE_KEY = "bb.thread.gitDiff.displayMode";
export const LINE_OVERFLOW_MODE_KEY = "bb.thread.gitDiff.lineOverflowMode";

/**
 * Reading and writing the two keys. An interface so the loop can be driven in
 * a test without a real Storage, and so a read failure has one place to live:
 * localStorage throws rather than returning null in a partitioned or
 * storage-disabled context, and a hack that throws on mount would take the
 * app's content-script generation down with it.
 */
/**
 * The window bits this store needs. It is a structural type rather than
 * `Window` so a test can inject an in-memory Storage: under Node 26, Node's
 * own unavailable `localStorage` global shadows jsdom's, so `window.localStorage`
 * inside a jsdom test is `undefined`.
 */
export interface PrefsStorageHost {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  addEventListener(
    type: "storage",
    listener: (event: StorageEvent) => void,
  ): void;
  removeEventListener(
    type: "storage",
    listener: (event: StorageEvent) => void,
  ): void;
}

export interface PrefsStore {
  read(): ToolbarPrefs;
  write(prefs: ToolbarPrefs): void;
  /** Fires when another window changes one of the keys. */
  subscribe(onChange: () => void): () => void;
}

function toViewMode(stored: string | null): ViewMode | undefined {
  return stored === "unified" || stored === "split" ? stored : undefined;
}

/**
 * bb's line-overflow preference is an enum, not a boolean, so the wrap flag
 * this hack carries internally is mapped at the boundary. Anything else stored
 * under the key — a value from a newer bb, or junk — reads as unset, which
 * leaves bb's own default in charge rather than guessing.
 */
function toWrap(stored: string | null): boolean | undefined {
  if (stored === "wrap") return true;
  if (stored === "scroll") return false;
  return undefined;
}

export function createLocalStoragePrefsStore(
  host: PrefsStorageHost,
): PrefsStore {
  const readKey = (key: string): string | null => {
    try {
      return host.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  return {
    read() {
      const prefs: ToolbarPrefs = {};
      const wrap = toWrap(readKey(LINE_OVERFLOW_MODE_KEY));
      const view = toViewMode(readKey(DISPLAY_MODE_KEY));
      if (wrap !== undefined) prefs.wrap = wrap;
      if (view !== undefined) prefs.view = view;
      return prefs;
    },
    write(prefs) {
      try {
        if (prefs.wrap !== undefined) {
          host.localStorage.setItem(
            LINE_OVERFLOW_MODE_KEY,
            prefs.wrap ? "wrap" : "scroll",
          );
        }
        if (prefs.view !== undefined) {
          host.localStorage.setItem(DISPLAY_MODE_KEY, prefs.view);
        }
      } catch {
        // A preference that cannot be stored is not worth failing a mount for.
      }
    },
    subscribe(onChange) {
      const onStorage = (event: StorageEvent) => {
        if (
          event.key === null ||
          event.key === DISPLAY_MODE_KEY ||
          event.key === LINE_OVERFLOW_MODE_KEY
        ) {
          onChange();
        }
      };
      host.addEventListener("storage", onStorage);
      return () => {
        host.removeEventListener("storage", onStorage);
      };
    },
  };
}

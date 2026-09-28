// One load of the shelf, shared by the page body and the Refresh button in
// the page's title bar, which the host mounts as separate components.
import type { ShelfList } from "../shelf/types";

export interface ShelfState {
  list: ShelfList | null;
  loading: boolean;
  error: string | null;
}

type Load = (refresh: boolean) => Promise<ShelfList>;

export function createShelfStore() {
  let state: ShelfState = { list: null, loading: false, error: null };
  const listeners = new Set<() => void>();
  let inFlight: Promise<void> | null = null;

  function set(next: Partial<ShelfState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    /** Loads the shelf, sharing a load already in flight rather than starting a second. */
    load(fetchList: Load, refresh: boolean): Promise<void> {
      if (inFlight) return inFlight;
      set({ loading: true });
      inFlight = fetchList(refresh)
        .then(
          (list) => set({ list, loading: false, error: null }),
          (cause: unknown) =>
            set({
              loading: false,
              error: cause instanceof Error ? cause.message : "Could not load plugins.",
            }),
        )
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}

export const shelfStore = createShelfStore();

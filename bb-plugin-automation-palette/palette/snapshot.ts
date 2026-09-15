// The snapshot the palette rows are built from.
//
// `setup` runs synchronously, so the rows for this app load come from what the
// last load wrote. The content script refreshes it in the background; a
// newly created automation therefore appears in the palette after the next app
// reload, which is the price of a host-collected, statically registered row.
import { parseAutomations, type AutomationSummary } from "./automations";

/** Namespaced so it is recognizable in devtools and unique to this plugin. */
export const SNAPSHOT_KEY = "bb-plugin-automation-palette:automations";

/** The slice of `localStorage` this module needs, so tests can pass a fake. */
export interface SnapshotStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The persisted automations, or none.
 *
 * Persisted values are untrusted input — another tab, an older version of this
 * plugin, or a hand-edited devtools entry can all have written them — so this
 * goes through the same tolerant parser as the CLI's output. A throwing
 * `getItem` (Safari's private mode, a storage quota error) reads as no
 * snapshot rather than a broken app load.
 */
export function readSnapshot(store: SnapshotStore | undefined): AutomationSummary[] {
  if (store === undefined) return [];
  try {
    const raw = store.getItem(SNAPSHOT_KEY);
    return raw === null ? [] : parseAutomations(raw);
  } catch {
    return [];
  }
}

/**
 * Persist the automations for the next app load.
 *
 * A throwing `setItem` is swallowed for the same reason as `getItem`: the
 * palette keeps this load's rows and tries again next time.
 */
export function writeSnapshot(
  store: SnapshotStore | undefined,
  automations: readonly AutomationSummary[],
): void {
  if (store === undefined) return;
  try {
    store.setItem(SNAPSHOT_KEY, JSON.stringify(automations));
  } catch {
    // Nothing to do: the rows this load registered are still usable.
  }
}

/**
 * Whether two lists would produce the same palette rows.
 *
 * The content script uses it to say, once, that the rows on screen are stale —
 * silence there would leave a just-created automation missing with no
 * explanation.
 */
export function sameAutomations(
  left: readonly AutomationSummary[],
  right: readonly AutomationSummary[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((automation, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      automation.id === other.id &&
      automation.projectId === other.projectId &&
      automation.name === other.name &&
      // The project's name is in the row's title, so renaming a project makes
      // the registered rows stale just as renaming an automation does.
      automation.projectName === other.projectName &&
      automation.enabled === other.enabled
    );
  });
}

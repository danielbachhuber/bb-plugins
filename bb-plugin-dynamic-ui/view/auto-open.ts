/**
 * Whether a thread's side panel has already opened by itself for the view as
 * it was last published.
 *
 * The panel opens on the first visit after each publish, not on every visit:
 * once it has opened, closing it keeps it closed until the view is published
 * again. Kept in localStorage so a reload does not count as a new visit.
 */
const PREFIX = "dynamic-ui:auto-opened:";

export function publishStamp(viewId: number, publishedAt: string): string {
  return `${viewId}@${publishedAt}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function alreadyAutoOpened(threadId: string, stamp: string): boolean {
  return storage()?.getItem(PREFIX + threadId) === stamp;
}

export function markAutoOpened(threadId: string, stamp: string): void {
  storage()?.setItem(PREFIX + threadId, stamp);
}

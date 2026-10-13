/**
 * Which item the side panel shows, per thread.
 *
 * The banner above the composer and the panel tab mount separately but share
 * this module, so a click on a row can switch the item an already-open tab
 * shows instead of opening another tab per item.
 */
import { useSyncExternalStore } from "react";

export interface Focus {
  viewId: number;
  itemId: string | null;
  /** An action whose confirmation should start open, for a command clicked in the banner. */
  confirmIndex?: number;
}

const focusByThread = new Map<string, Focus>();
const listeners = new Set<() => void>();

export function setFocus(threadId: string, focus: Focus): void {
  focusByThread.set(threadId, focus);
  for (const listener of listeners) listener();
}

export function focusOf(threadId: string): Focus | undefined {
  return focusByThread.get(threadId);
}

export function useFocus(threadId: string): Focus | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => focusByThread.get(threadId),
  );
}

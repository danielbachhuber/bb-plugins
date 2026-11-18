// What each thread with a goal is doing, as the sidebar reads it off bb's row
// icons, shared with the header button in the same frontend so its donut can
// spin and turn blue as the sidebar's does. A thread whose sidebar row isn't
// mounted has no entry, and its header donut shows no activity.
import { useSyncExternalStore } from "react";

import type { DonutActivity } from "./goal-line";

let activities: ReadonlyMap<string, DonutActivity> = new Map();
const listeners = new Set<() => void>();

/** Replaces every thread's activity; called by the sidebar after each pass. */
export function setGoalActivities(next: ReadonlyMap<string, DonutActivity>): void {
  const same = next.size === activities.size && [...next].every(([id, activity]) => activities.get(id) === activity);
  if (same) return;
  activities = next;
  for (const listener of listeners) listener();
}

/** The thread's activity, updated as the sidebar sees it change. */
export function useGoalActivity(threadId: string): DonutActivity {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => activities.get(threadId) ?? null,
  );
}

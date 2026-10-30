/**
 * Which stored views to delete, so the database does not keep every view and
 * image ever published.
 *
 * A view shows in the thread that published it and in every thread its items
 * name. It can go once none of those threads can show it again: each one was
 * deleted, or has been archived for longer than the setting allows. A thread
 * that could not be looked up keeps the view, so a failed request never
 * deletes anything.
 */

export const DAY_MS = 24 * 60 * 60_000;

/** What a lookup found for one thread. */
export type ThreadState = { archivedAt: number | null } | "gone" | "unknown";

export interface ViewThreads {
  id: number;
  /** The thread that published the view, then each thread its items name. */
  threads: string[];
}

export function expiredViews(
  views: ViewThreads[],
  states: Map<string, ThreadState>,
  now: number,
  keepArchivedMs: number,
): number[] {
  const done = (threadId: string): boolean => {
    const state = states.get(threadId) ?? "unknown";
    if (state === "gone") return true;
    if (state === "unknown" || state.archivedAt === null) return false;
    return now - state.archivedAt >= keepArchivedMs;
  };
  return views.filter((view) => view.threads.every(done)).map((view) => view.id);
}

/** Whether an error from `threads.get` means the thread no longer exists, rather than that the request failed. */
export function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { status, code, message } = error as { status?: unknown; code?: unknown; message?: unknown };
  if (status === 404 || code === "not_found" || code === "thread_not_found") return true;
  return typeof message === "string" && /\bnot found\b/i.test(message);
}

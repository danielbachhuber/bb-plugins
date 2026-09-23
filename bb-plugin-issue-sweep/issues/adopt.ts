/**
 * Recognising a thread someone started by hand for an issue this sweep knows.
 *
 * gh-context reads each thread's first prompt and links the one issue it
 * names; which threads this sweep may then claim is decided here.
 */

/**
 * Whether a thread is a candidate for adoption at all.
 *
 * `originPluginId` is the important one: a thread this plugin started is
 * already linked, and a thread another plugin started belongs to that plugin's
 * own accounting. Only a null origin is someone typing into the composer.
 */
export function isAdoptable(thread: {
  id: string;
  originPluginId: string | null;
  archivedAt: number | null;
}): boolean {
  return thread.originPluginId === null && thread.archivedAt === null;
}

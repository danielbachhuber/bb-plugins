/**
 * Recognising a thread someone started by hand for a pull request this sweep
 * knows.
 *
 * gh-context reads each thread's first prompt and links the pull request it
 * names; which threads this sweep may then claim is decided here. A thread
 * another plugin started belongs to that plugin's own accounting.
 */

/**
 * Whether a thread is a candidate for adoption at all.
 *
 * `originPluginId` is the important one: a thread this plugin started is
 * already linked, and a thread another plugin started belongs to that plugin's
 * own accounting. Only a null origin is someone typing into the composer.
 */
export function isAdoptable(
  thread: {
    id: string;
    originPluginId: string | null;
    archivedAt: number | null;
  },
  ownPluginId: string | null = null,
): boolean {
  if (thread.archivedAt !== null) return false;
  // This plugin's own threads too, when the caller names itself. A thread it
  // started and later archived has had its link dropped, and unarchiving one
  // fires no event to put the link back — so without this the row goes on
  // offering to start a second thread on a pull request that already has one
  // open. Another plugin's thread is still that plugin's business.
  return thread.originPluginId === null || thread.originPluginId === ownPluginId;
}

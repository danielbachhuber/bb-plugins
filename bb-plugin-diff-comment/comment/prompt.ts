// The message Ask agent sends to the thread for one comment.
//
// One function, used by the composer, the comment card, and the panel, so
// they cannot drift into asking for slightly different things.

/**
 * Routes to the skill rather than restating the procedure. A prompt that
 * re-explains how to answer a comment only contradicts the skill that owns it
 * the first time either one changes.
 */
export function askPrompt(seq: number): string {
  return (
    `Answer diff comment #${seq} on this thread's diff, using the diff-comments skill. ` +
    `Work on that comment only.`
  );
}

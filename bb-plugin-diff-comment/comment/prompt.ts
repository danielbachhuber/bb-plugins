// The message that hands the comments to the agent.
//
// One function, used by both the thread-header button and the panel, so the
// two cannot drift into asking for slightly different things.

/**
 * Routes to the skill rather than restating the procedure. A prompt that
 * re-explains how to work the queue only contradicts the skill that owns it
 * the first time either one changes.
 */
export function agentPrompt(open: number): string {
  const count = open === 1 ? "comment" : "comments";
  return (
    `Work through the ${open} open ${count} on this diff, one at a time, ` +
    `using the diff-comments skill.`
  );
}

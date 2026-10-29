// The messages Ask agent sends for one comment.
//
// Used by the composer, the comment card, and the panel alike, so they cannot
// drift into asking for slightly different things. Both route to the skill
// rather than restating the procedure: a prompt that re-explains how to answer
// a comment only contradicts the skill that owns it the first time either one
// changes.

/** The first message of the subthread Ask agent forks to answer a comment. */
export function forkPrompt(seq: number): string {
  return (
    `This is a subthread, forked so you can answer diff comment #${seq} without waiting ` +
    `for the work above to finish. Answer that comment, using the diff-comments skill; ` +
    `\`bb diff-comment\` here acts on the comments of the thread this was forked from. ` +
    `Work on that comment only, then stop. Do not carry on with the work above.`
  );
}

/** Sent to the thread itself when it cannot be forked. */
export function askPrompt(seq: number): string {
  return (
    `Answer diff comment #${seq} on this thread's diff, using the diff-comments skill. ` +
    `Work on that comment only.`
  );
}

/**
 * Sent to the subthread that answered a comment when its author replies to
 * the answer. The subthread already holds what it found the first time.
 */
export function followUpPrompt(seq: number): string {
  return (
    `The author replied to your answer on diff comment #${seq}. Read the reply with ` +
    `\`bb diff-comment show #${seq}\` and answer it with \`bb diff-comment reply\`, ` +
    `using the diff-comments skill. Work on that comment only, then stop.`
  );
}

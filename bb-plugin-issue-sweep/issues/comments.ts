/**
 * How many of an issue's comments count as seen, given who wrote each one.
 *
 * A comment you wrote is not new to you, and neither is anything before it:
 * you read the thread to reply to it. So the seen count moves up to just past
 * your latest comment, and only what others wrote after that stays new. It
 * never moves down, so a deleted comment cannot make old ones new again.
 */
export function seenThroughOwn(authors: readonly string[], seen: number, viewer: string): number {
  const own = viewer.toLowerCase();
  let last = -1;
  authors.forEach((author, index) => {
    if (author.toLowerCase() === own) last = index;
  });
  return Math.max(seen, last + 1);
}

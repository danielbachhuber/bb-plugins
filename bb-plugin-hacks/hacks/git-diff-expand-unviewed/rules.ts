// Which cards to expand, as pure functions over what the DOM said.
import type { DiffCard } from "./cards";

/**
 * Whether a header's `+N -M` text belongs to a deleted file.
 *
 * bb passes `hideZero` to the stat tally only for added and deleted files, so a
 * deletion renders as `-12` with no `+` beside it, while an ordinary file that
 * only removed lines still renders `+0 -12`. The signal is inferred rather than
 * declared, so anything unreadable counts as not-a-deletion: expanding a file
 * that should have stayed folded is a smaller annoyance than leaving one
 * folded that the user wanted open, and it is the one the user can undo.
 */
export function isDeletion(stats: string): boolean {
  return /-\s*\d/.test(stats) && !stats.includes("+");
}

/**
 * How a card is remembered once it has been seen open, so a manual collapse
 * sticks.
 */
export function expansionKey(card: DiffCard): string {
  return `${card.path} ${card.stats}`;
}

/**
 * The cards to expand on this pass.
 *
 * A card is expanded only if it has never been seen open for this diff. bb
 * starts a diff of ten files or fewer fully open, so those cards are seen open
 * on the first pass and a later collapse is left alone. A larger diff starts
 * folded, and each of its cards is opened once per path and stats pair: a file
 * whose diff has since changed is a new card that gets one more chance.
 *
 * There is no file-count check here. bb virtualizes the list, so the cards in
 * the DOM are only the ones near the viewport, and their count says nothing
 * about the size of the diff.
 */
export function cardsToExpand(
  cards: readonly DiffCard[],
  seenOpen: ReadonlySet<string>,
): DiffCard[] {
  return cards.filter(
    (card) =>
      card.isCollapsed &&
      !card.isViewed &&
      !isDeletion(card.stats) &&
      !seenOpen.has(expansionKey(card)),
  );
}

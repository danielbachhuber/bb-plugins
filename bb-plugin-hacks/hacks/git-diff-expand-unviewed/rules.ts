// Which cards to expand, as pure functions over what the DOM said.
import type { DiffCard } from "./cards";

/**
 * bb's own `GIT_DIFF_AUTO_COLLAPSE_FILE_THRESHOLD`. Above it bb starts a diff
 * with every file collapsed; at or below it every file starts expanded, so a
 * collapsed card is something the user did and this hack must not undo.
 * Mirroring the constant is the whole reason this is a hack: bb does not expose
 * it as a setting.
 */
export const AUTO_COLLAPSE_FILE_THRESHOLD = 10;

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

/** How a card is remembered once expanded, so a manual re-collapse sticks. */
export function expansionKey(card: DiffCard): string {
  return `${card.path} ${card.stats}`;
}

/**
 * The cards to expand on this pass.
 *
 * Nothing happens below bb's threshold, because there bb collapsed nothing and
 * every collapsed card is the user's doing. Above it, a card is expanded only
 * once per path and stats pair: collapse it by hand afterwards and it stays
 * collapsed, and a file whose diff has since changed is a new card that gets
 * one more chance to open.
 */
export function cardsToExpand(
  cards: readonly DiffCard[],
  expanded: ReadonlySet<string>,
): DiffCard[] {
  if (cards.length <= AUTO_COLLAPSE_FILE_THRESHOLD) return [];
  return cards.filter(
    (card) =>
      card.isCollapsed &&
      !card.isViewed &&
      !isDeletion(card.stats) &&
      !expanded.has(expansionKey(card)),
  );
}

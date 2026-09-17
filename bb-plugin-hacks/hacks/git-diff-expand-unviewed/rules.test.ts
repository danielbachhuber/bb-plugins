import { describe, expect, it } from "vitest";
import type { DiffCard } from "./cards";
import {
  AUTO_COLLAPSE_FILE_THRESHOLD,
  cardsToExpand,
  expansionKey,
  isDeletion,
} from "./rules";

function card(overrides: Partial<DiffCard> & { path: string }): DiffCard {
  return {
    stats: "+2 -2",
    toggle: null as unknown as HTMLButtonElement,
    isCollapsed: true,
    isViewed: false,
    ...overrides,
  };
}

function manyCards(count: number, overrides: Partial<DiffCard> = {}): DiffCard[] {
  return Array.from({ length: count }, (_, index) =>
    card({ path: `src/file-${index}.ts`, ...overrides }),
  );
}

const OVER_THRESHOLD = AUTO_COLLAPSE_FILE_THRESHOLD + 1;

describe("isDeletion", () => {
  it("reads a deletion, which bb renders without its zero side", () => {
    expect(isDeletion("-12")).toBe(true);
  });

  it("does not read a file that merely removed every line as deleted", () => {
    // bb hides the zero only for added and deleted files, so an ordinary file
    // with no additions still carries a `+0`.
    expect(isDeletion("+0 -12")).toBe(false);
  });

  it("does not read an addition as a deletion", () => {
    expect(isDeletion("+41")).toBe(false);
  });

  it("treats an unreadable header as not a deletion", () => {
    // Expanding a file that should have stayed folded is the recoverable
    // mistake; leaving one folded is the annoyance the hack exists to fix.
    expect(isDeletion("")).toBe(false);
    expect(isDeletion("Binary file")).toBe(false);
  });
});

describe("cardsToExpand", () => {
  it("expands the collapsed files in a diff bb auto-collapsed", () => {
    const cards = manyCards(OVER_THRESHOLD);
    expect(cardsToExpand(cards, new Set())).toHaveLength(OVER_THRESHOLD);
  });

  it("does nothing at or below bb's threshold", () => {
    // Below it bb collapsed nothing, so a collapsed card is the user's doing.
    const cards = manyCards(AUTO_COLLAPSE_FILE_THRESHOLD);
    expect(cardsToExpand(cards, new Set())).toEqual([]);
  });

  it("leaves a file diff-viewed has marked read collapsed", () => {
    const cards = manyCards(OVER_THRESHOLD);
    cards[0] = card({ path: cards[0]!.path, isViewed: true });
    const expanded = cardsToExpand(cards, new Set());
    expect(expanded.map((c) => c.path)).not.toContain(cards[0]!.path);
    expect(expanded).toHaveLength(OVER_THRESHOLD - 1);
  });

  it("leaves a deleted file collapsed", () => {
    const cards = manyCards(OVER_THRESHOLD);
    cards[0] = card({ path: cards[0]!.path, stats: "-40" });
    expect(cardsToExpand(cards, new Set()).map((c) => c.path)).not.toContain(
      cards[0]!.path,
    );
  });

  it("leaves an already-expanded file alone", () => {
    const cards = manyCards(OVER_THRESHOLD, { isCollapsed: false });
    expect(cardsToExpand(cards, new Set())).toEqual([]);
  });

  it("does not reopen a card it has already opened", () => {
    const cards = manyCards(OVER_THRESHOLD);
    const expanded = new Set([expansionKey(cards[0]!)]);
    expect(cardsToExpand(cards, expanded).map((c) => c.path)).not.toContain(
      cards[0]!.path,
    );
  });

  it("gives a file one more chance once its diff has changed", () => {
    // The key carries the stats, so a rebased file is a different card.
    const before = card({ path: "src/a.ts", stats: "+2 -2" });
    const after = card({ path: "src/a.ts", stats: "+9 -1" });
    const cards = [after, ...manyCards(OVER_THRESHOLD)];
    expect(cardsToExpand(cards, new Set([expansionKey(before)]))).toContain(
      after,
    );
  });
});

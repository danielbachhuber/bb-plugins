// Which key moves which way. A presentation clicker sends Page Up and Page
// Down, so those are here alongside the arrows.

export type SlideMove = "next" | "previous" | "first" | "last";

export function keyToMove(key: string): SlideMove | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "previous";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

/** The slide index after a move, held inside the deck. */
export function applyMove(index: number, count: number, move: SlideMove): number {
  if (count === 0) return 0;
  switch (move) {
    case "next":
      return Math.min(index + 1, count - 1);
    case "previous":
      return Math.max(index - 1, 0);
    case "first":
      return 0;
    case "last":
      return count - 1;
  }
}

// A deck's own look: the `style.css` in its folder, kept to its slides.

/** The file in a deck folder whose rules style that deck's slides. */
export const STYLE_FILE = "style.css";

/** The element around each slide that a deck's style is scoped to. */
export const DECK_SCOPE_CLASS = "bbp-deck";

/**
 * Wraps a deck's CSS in `@scope (.bbp-deck)`, so its rules reach the slide
 * and what is on it, and never the rest of bb. The scope is the slide's
 * wrapper rather than the slide, because a scoped selector only matches
 * elements inside the scoping root, and a rule for `.bbp-slide` has to match
 * the slide itself.
 */
export function scopeDeckStyle(css: string): string {
  return `@scope (.${DECK_SCOPE_CLASS}) {\n${css}\n}`;
}

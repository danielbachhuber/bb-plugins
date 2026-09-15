// The only styles that live inside the diff's shadow root.
//
// Shadow DOM blocks the app's stylesheet, so anything in there has to bring
// its own CSS. That is why the comment cards are projected out through a slot
// instead: they keep bb's styles. Only the hover affordance is genuinely
// inside, and it is one small button.
//
// Colours come from Pierre's own custom properties, which are already defined
// in this shadow root, so the button tracks the code theme rather than
// guessing at it.
export const OVERLAY_CSS = `
/* bb's own per-line control is [data-utility-button]: 1lh square, a 16px icon,
   4px radius, filled with --diffs-modified-base. Its container is anchored to
   the gutter cell's right edge and justified to flex-end, and the button then
   carries \`margin-right: calc(-1lh + 1ch)\`, which puts its right edge at
   cellRight + 1lh - 1ch. That is why bb's button already overhangs the code by
   1lh - 1ch.

   Ours copies those metrics and sits flush against it, so the two form one
   two-button toolbar. But a second button to the right of bb's would double
   that overhang and bury the first characters of the line. So when ours is
   present the PAIR shifts left by one button width: bb's margin becomes 1ch
   (right edge at cellRight - 1ch) and ours takes the slot bb's used to hold.
   The pair then hides exactly as much code as bb's single button did, and the
   extra width falls in the gutter, over the line number of the hovered line —
   which is where GitHub puts its own comment affordance. */
[data-column-number]:has([data-diff-comment-trigger]) [data-utility-button] {
  border-radius: 4px 0 0 4px;
  margin-right: 1ch;
}

[data-diff-comment-trigger] {
  position: absolute;
  top: 0;
  right: calc(-1lh + 1ch);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1lh;
  height: 1lh;
  padding: 0;
  margin: 0;
  border: 0;
  appearance: none;
  border-radius: 4px;
  font-size: var(--diffs-font-size, 13px);
  line-height: var(--diffs-line-height, 20px);
  background-color: var(--diffs-modified-base);
  color: var(--diffs-bg);
  fill: currentColor;
  cursor: pointer;
}

/* Only square our left corners when bb's button is actually beside us. On
   hover it is, but a diff without the gutter utility would otherwise leave a
   lone button with one flat edge. */
[data-column-number]:has([data-utility-button]) [data-diff-comment-trigger] {
  border-radius: 0 4px 4px 0;
  box-shadow: inset 1px 0 0 var(--diffs-bg);
}

[data-diff-comment-trigger]:hover,
[data-diff-comment-trigger]:focus-visible {
  filter: brightness(1.15);
}

/* Our rows are Pierre annotation rows, which the host sheet already styles.
   This only stops a card being squeezed to nothing in a narrow panel. */
[data-diff-comment-owned][data-line-annotation] {
  min-height: 1lh;
}
`;

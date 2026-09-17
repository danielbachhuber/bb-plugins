// Pure logic for the changes-panel toolbar preferences: line wrap, and the
// stacked/split view mode.
//
// bb keeps both in React state, so they reset every time the panel remounts,
// and the view mode additionally reverts to a width-driven default. These are
// preferences about how you read a diff rather than facts about a thread, so
// they are stored once and apply everywhere.

export type ViewMode = "unified" | "split";

/**
 * What the user has chosen. A missing field means they have never touched that
 * control, and bb's own default stands — which matters for `view`, because bb
 * picks stacked or split from the panel's width until you override it. Storing
 * "no preference" separately from "stacked" is what keeps that default alive.
 */
export interface ToolbarPrefs {
  wrap?: boolean;
  view?: ViewMode;
}

/** The toolbar controls this hack drives, by the click it takes to set them. */
export type ToolbarClick = "wrap" | "stacked" | "split";

/** The toolbar as read out of the DOM; null where the control was not found. */
export interface ToolbarState {
  wrap: boolean | null;
  view: ViewMode | null;
}

/**
 * Which buttons to click to bring the toolbar to the saved preferences.
 * Returns nothing for a control with no saved preference, one bb did not
 * render, or one that already reads the way it should — clicking a control
 * that already agrees would toggle it away.
 */
export function clicksToApply(
  saved: ToolbarPrefs,
  current: ToolbarState,
): ToolbarClick[] {
  const clicks: ToolbarClick[] = [];
  if (
    saved.wrap !== undefined &&
    current.wrap !== null &&
    saved.wrap !== current.wrap
  ) {
    clicks.push("wrap");
  }
  if (
    saved.view !== undefined &&
    current.view !== null &&
    saved.view !== current.view
  ) {
    clicks.push(saved.view === "split" ? "split" : "stacked");
  }
  return clicks;
}

/**
 * A control the user just clicked, and what they asked it to be.
 *
 * Intent comes from the click, never from watching the toolbar change. bb moves
 * these controls on its own — `handleSecondaryPanelWidthChange` in
 * useResponsiveGitDiffPanelDisplay.ts re-applies the width-driven default
 * whenever the panel crosses 760px — and a change observed after the fact
 * cannot be told apart from a choice. Inferring it from the DOM is what let
 * bb's override overwrite a stored preference.
 */
export type ToolbarIntent = Pick<ToolbarPrefs, "wrap"> | Pick<ToolbarPrefs, "view">;

/**
 * Fold a click's intent into the saved preferences. Returns the original object
 * when the click asked for what was already stored, which is the signal callers
 * use to skip a write.
 */
export function withIntent(
  saved: ToolbarPrefs,
  intent: ToolbarIntent,
): ToolbarPrefs {
  const next: ToolbarPrefs = { ...saved, ...intent };
  if (next.wrap === saved.wrap && next.view === saved.view) return saved;
  return next;
}

/** Whether two observed toolbar states are the same reading. */
export function sameState(a: ToolbarState, b: ToolbarState): boolean {
  return a.wrap === b.wrap && a.view === b.view;
}

/**
 * The state the toolbar will settle into once the applied clicks land. React
 * re-renders after the click, so the DOM still reads the old value on the tick
 * that issues it; recording the intended state instead of the observed one is
 * what keeps that lag from looking like the user changing their mind.
 */
export function stateAfter(
  current: ToolbarState,
  clicks: readonly ToolbarClick[],
): ToolbarState {
  let { wrap, view } = current;
  for (const click of clicks) {
    if (click === "wrap") wrap = wrap === null ? null : !wrap;
    if (click === "stacked") view = "unified";
    if (click === "split") view = "split";
  }
  return { wrap, view };
}

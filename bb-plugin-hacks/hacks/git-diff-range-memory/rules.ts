// Whether to put a thread's range back, as pure functions over what the
// selector's props said.

/** bb's own `ALL_GIT_DIFF_SELECTION`, the range it falls back to. */
export const ALL_CHANGES = "all";

/**
 * How long after arriving at a thread a matching range is still checked
 * again. bb clears the range in an effect that runs after the thread switch
 * renders, so a pass in between can read the previous thread's range and
 * mistake it for this one's.
 */
export const SETTLE_MS = 1500;

/** One entry in bb's range dropdown, as `GitDiffSelector` receives it. */
export interface RangeOption {
  value: string;
  label: string;
  monoPrefix?: string;
}

/**
 * The text a dropdown item or the trigger shows for an option. bb renders the
 * commit's short SHA and the label as adjacent spans, so their text runs
 * together with nothing between.
 */
export function optionText(option: RangeOption): string {
  return `${option.monoPrefix ?? ""}${option.label}`;
}

/** The option a menu item's text names, if any. */
export function optionForText(
  options: readonly RangeOption[],
  text: string,
): RangeOption | undefined {
  const wanted = text.trim();
  return options.find((option) => optionText(option) === wanted);
}

export type RestoreDecision =
  /** The range is what was stored and has stayed so long enough to trust. */
  | { kind: "done" }
  /** Select the stored range now. */
  | { kind: "apply" }
  /** The stored range may not have loaded yet; look again on a later pass. */
  | { kind: "wait" }
  /** This thread's ranges have loaded and the stored one is not among them. */
  | { kind: "give-up" };

/**
 * What to do about a thread whose stored range is `stored`.
 *
 * bb lists only "All changes" until the thread's status has loaded, and drops
 * a selection whose option is missing, so selecting the stored range early
 * would be undone at once. Once anything else is listed the status has
 * loaded, and a stored range that still is not there, such as Uncommitted
 * after everything was committed, is left alone for this visit.
 */
export function restoreDecision(input: {
  stored: string;
  value: string;
  options: readonly RangeOption[];
  sinceArrivalMs: number;
}): RestoreDecision {
  const { stored, value, options, sinceArrivalMs } = input;
  if (value === stored) {
    return sinceArrivalMs >= SETTLE_MS ? { kind: "done" } : { kind: "wait" };
  }
  if (options.some((option) => option.value === stored)) {
    return { kind: "apply" };
  }
  return options.length <= 1 ? { kind: "wait" } : { kind: "give-up" };
}

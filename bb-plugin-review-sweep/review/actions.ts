import { ageInDays, sizeBucket, type ChangeSize, type ReviewState } from "./types.js";

/**
 * The skill that owns the work. There is one action here, so unlike pr-sweep
 * there is nothing to route: every row is "read this diff and tell me what you
 * find".
 *
 * Naming it is not enough on its own. Two commands answer to `code-review` on
 * this machine — the built-in one, which posts only when passed `--comment`,
 * and the claude-plugins-official one, whose last step posts a `gh pr comment`
 * unconditionally. Which one a spawned thread resolves is not something this
 * plugin controls, so `buildPrompt` states the no-posting constraint outright
 * rather than relying on picking the right skill.
 */
export const REVIEW_SKILL = "code-review";

export const ACTION_LABELS: Record<ReviewState, string> = {
  "first-look": "Review",
  "re-review": "Re-review",
};

export function actionLabel(state: ReviewState): string {
  return ACTION_LABELS[state] ?? "Review";
}

/**
 * The action says what the click does, not what kind of review it is: the
 * row's run and track already say whether it is a re-review.
 *
 * The thread title still uses actionLabel, so the sidebar keeps the
 * first-look/re-review distinction that the action does not carry.
 */
export const START_REVIEW_LABEL = "Start review";

/**
 * Conventional-commit and ticket prefixes carry no information once the number
 * is already in the title, and they push the words that do carry it past where
 * the sidebar clips.
 */
const TITLE_PREFIX = /^\s*(?:\[[^\]]+\]\s*|\([^)]+\)\s*|[A-Za-z]+!?(?:\([^)]*\))?!?:\s*)+/;

const SEPARATOR = ": ";

/**
 * "Re-review #5622: Retry sync on 429 with exponential backoff".
 *
 * The whole title, uncut. bb clips a thread title to the sidebar's width and
 * appends its own ellipsis, so a title cut to a guessed budget here read as
 * "Retire the last…..." — truncated twice, once by us and once for real. It
 * also threw away the tail that the thread list, search, and hover would have
 * shown in full.
 */
export function threadTitle(state: ReviewState, number: number, prTitle = ""): string {
  const head = `${actionLabel(state)} #${number}`;
  const gist = prTitle.replace(TITLE_PREFIX, "").replace(/\s+/g, " ").trim();
  return gist ? `${head}${SEPARATOR}${gist}` : head;
}

export const PERMISSION_MODES = ["accept-edits", "auto", "full"] as const;

export type PermissionModeSetting = (typeof PERMISSION_MODES)[number];

/**
 * Narrows the stored setting, which the SDK types only as `string`, to the
 * union `threads.spawn` accepts, so a hand-edited settings file cannot reach
 * the spawn call with a mode bb would reject.
 *
 * The default is `full` for an unobvious reason: `auto` keeps the workspace
 * sandbox, which blocks network egress, and a review thread that cannot reach
 * GitHub cannot read the diff it was started for. The sandbox has no way to
 * express "may read GitHub, may not write to it", so the no-posting rule lives
 * in the prompt instead.
 */
export function parsePermissionMode(raw: string | undefined): PermissionModeSetting {
  return (PERMISSION_MODES as readonly string[]).includes(raw ?? "")
    ? (raw as PermissionModeSetting)
    : "full";
}

export const DEFAULT_STALE_AFTER_DAYS = 2;

/** Never throws: a malformed setting must not stop the panel from rendering. */
export function parseStaleAfterDays(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_STALE_AFTER_DAYS;
  return Math.floor(parsed);
}

/**
 * How long "Ignore" ignores for. One duration, not a menu of them: the useful
 * question is "not today", and two days answers it without asking a second
 * question at the moment you are trying to clear the queue.
 *
 * A fixed timer, deliberately. Waking a snoozed row on the author's next push
 * would let a chatty pull request undo the deferral within minutes, which is
 * the opposite of what the click asked for.
 */
export const SNOOZE_HOURS = 48;

export const SNOOZE_LABEL = `Ignore for ${SNOOZE_HOURS} hours`;

export const UNSNOOZE_LABEL = "Stop ignoring";

export function snoozeUntil(now: number): number {
  return now + SNOOZE_HOURS * 3_600_000;
}

/**
 * "returns in 41 hours". Counts in hours below two days, where the hour is the
 * useful number, and rounds up rather than down: a deadline 30 minutes out is
 * "returns in 1 hour", never "returns in 0 hours".
 */
export function returnsInLabel(until: number, now: number): string {
  const hours = Math.ceil(Math.max(0, until - now) / 3_600_000);
  if (hours <= 0) return "returning";
  if (hours < HOURS_BEFORE_DAYS)
    return hours === 1 ? "returns in 1 hour" : `returns in ${hours} hours`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? "returns in 1 day" : `returns in ${days} days`;
}

export const DISPLAY_SECTIONS = ["needs-review", "in-progress", "draft", "snoozed"] as const;

export type DisplaySection = (typeof DISPLAY_SECTIONS)[number];

/**
 * Which rows the sidebar counts as waiting on you: `needs-review` only.
 *
 * A pull request with a thread is being worked on, so it is not waiting on
 * you, otherwise the count overstates the queue and invites a second click on
 * a review already running.
 *
 * A draft requested of you is a real request, but it is not offered for review
 * yet, so it is not counted either.
 *
 * An ignored review is left out, since counting it would undo the point of
 * ignoring it. A thread outranks the deferral, because a review being worked
 * on is stronger evidence than a click from two days ago.
 *
 * The list's own placement is `runOf` in tiers.ts.
 */
export function displaySection(
  hasThread: boolean,
  isDraft: boolean,
  isSnoozed = false,
): DisplaySection {
  if (hasThread) return "in-progress";
  if (isSnoozed) return "snoozed";
  return isDraft ? "draft" : "needs-review";
}

/** Below this, a return time is reported in hours; at or above it, in days. */
export const HOURS_BEFORE_DAYS = 48;

/** "+120 −8, 6 files". An en dash for the deletions, not a hyphen. */
export function sizeLabel(size: ChangeSize): string {
  const files = size.changedFiles === 1 ? "1 file" : `${size.changedFiles} files`;
  return `+${size.additions} −${size.deletions}, ${files}`;
}

export { sizeBucket, ageInDays };

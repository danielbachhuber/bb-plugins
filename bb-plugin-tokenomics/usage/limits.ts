// A subscription's usage limits, as Provider usage reports them, and where
// each is headed at the pace of the recent readings. Pure: the server stores
// the readings and passes them in.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** One reading of one limit window, as the server stored it. */
export interface LimitSample {
  providerId: string;
  /** The provider's id for the account, so two subscriptions stay apart; null when it reports none. */
  accountKey: string | null;
  label: string;
  /** "five-hour" or "weekly" today; other values pass through. */
  kind: string;
  /** Set on a window that counts only one model, such as a weekly limit for one model family. */
  model: string | null;
  sampledAt: number;
  usedPercent: number;
  resetsAt: number;
}

export type LimitTone = "ok" | "warning" | "error";

/** A limit window with where it is headed. */
export interface LimitView {
  providerId: string;
  accountKey: string | null;
  label: string;
  kind: string;
  usedPercent: number;
  resetsAt: number;
  sampledAt: number;
  /** Percent used per hour over the recent readings; null until there are enough of them. */
  pacePerHour: number | null;
  /** Where the window will be at its reset at that pace; null without a pace. */
  projectedPercent: number | null;
  /** When it reaches 100% at that pace, if that comes before the reset; its latest reading's time once it is already full. */
  runsOutAt: number | null;
  tone: LimitTone;
}

/** How far back each kind of window reads its pace, and the least span that counts as one. */
const PACE_SPAN: Record<string, { lookback: number; least: number }> = {
  // A session lasts five hours, so its last hour is what's coming next.
  "five-hour": { lookback: HOUR, least: 10 * MINUTE },
  // A week's pace from one busy hour says it runs out in a day, so it reads a day.
  weekly: { lookback: 24 * HOUR, least: HOUR },
};

/** The width of each of a session's slots in the title bar's spark chart. */
export const SLOT_MS = 15 * MINUTE;

/**
 * A reading this many points below the one before it, in the same window,
 * means the provider started counting the window again, as when a plan
 * changes. Readings are rounded to whole points, so one point is noise.
 */
const RESCALE_DROP = 2;

/** Whether `after` restarts the count of the window `before` was in, without the window resetting. */
function rescaled(before: LimitSample, after: LimitSample): boolean {
  // Reset times wobble by a few milliseconds between readings.
  return Math.abs(after.resetsAt - before.resetsAt) <= MINUTE && after.usedPercent <= before.usedPercent - RESCALE_DROP;
}

/**
 * When the account last restarted counting a window without the window
 * resetting, as when a plan changes and the provider counts the same week
 * against a new limit; null if it hasn't. Percents read before that are in
 * the old limit's units, so neither a pace nor a size can use them.
 */
export function rescaledAt(samples: readonly LimitSample[], providerId: string, accountKey: string | null): number | null {
  const byWindow = new Map<string, LimitSample[]>();
  for (const sample of [...samples].sort((a, b) => a.sampledAt - b.sampledAt)) {
    if (sample.providerId !== providerId || sample.accountKey !== accountKey || sample.model !== null) continue;
    byWindow.set(windowKey(sample), [...(byWindow.get(windowKey(sample)) ?? []), sample]);
  }
  let latest: number | null = null;
  for (const windowSamples of byWindow.values()) {
    for (let index = 1; index < windowSamples.length; index += 1) {
      const after = windowSamples[index]!;
      if (rescaled(windowSamples[index - 1]!, after) && (latest === null || after.sampledAt > latest)) latest = after.sampledAt;
    }
  }
  return latest;
}

/** Past this projected percent a limit is amber. */
export const WARNING_PERCENT = 80;

/** Readings of the same window share these. */
export function windowKey(sample: Pick<LimitSample, "providerId" | "accountKey" | "label">): string {
  return `${sample.providerId}\u0000${sample.accountKey ?? ""}\u0000${sample.label}`;
}

/**
 * Percent used per hour across `samples`, oldest first, over the lookback
 * before `now`. A reading whose reset time moved on started a new window, so
 * its whole percent counts as new use.
 */
export function pacePerHour(samples: readonly LimitSample[], now: number, kind: string): number | null {
  const span = PACE_SPAN[kind] ?? PACE_SPAN["weekly"]!;
  const from = now - span.lookback;
  const inside = samples.findIndex((sample) => sample.sampledAt >= from);
  if (inside === -1) return null;
  // The last reading before the lookback is the baseline for the first one
  // in it, unless polling stopped for long enough that it says little.
  const baseline = samples[inside - 1];
  const start = baseline !== undefined && baseline.sampledAt >= from - span.lookback ? inside - 1 : inside;
  let recent = samples.slice(start).filter((sample) => sample.sampledAt <= now);
  // Use from before the window was counted again is in another limit's units.
  for (let index = recent.length - 1; index > 0; index -= 1) {
    if (rescaled(recent[index - 1]!, recent[index]!)) {
      recent = recent.slice(index);
      break;
    }
  }
  if (recent.length < 2) return null;
  const first = recent[0]!;
  const last = recent.at(-1)!;
  if (last.sampledAt - first.sampledAt < span.least) return null;
  let used = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const before = recent[index - 1]!;
    const after = recent[index]!;
    // Reset times wobble by a few milliseconds between readings.
    const reset = Math.abs(after.resetsAt - before.resetsAt) > MINUTE;
    used += reset ? after.usedPercent : Math.max(0, after.usedPercent - before.usedPercent);
  }
  return (used / (last.sampledAt - first.sampledAt)) * HOUR;
}

/** The window's latest reading with where it's headed. `samples` are this window's, oldest first. */
export function viewOf(samples: readonly LimitSample[], now: number): LimitView {
  const latest = samples.at(-1)!;
  const pace = pacePerHour(samples, now, latest.kind);
  const left = Math.max(0, latest.resetsAt - now);
  const projectedPercent = pace === null ? null : latest.usedPercent + (pace * left) / HOUR;
  let runsOutAt: number | null = null;
  if (latest.usedPercent >= 100) runsOutAt = latest.sampledAt;
  else if (pace !== null && pace > 0) {
    const at = now + ((100 - latest.usedPercent) / pace) * HOUR;
    if (at < latest.resetsAt) runsOutAt = at;
  }
  const tone: LimitTone =
    runsOutAt !== null ? "error" : (projectedPercent ?? latest.usedPercent) >= WARNING_PERCENT ? "warning" : "ok";
  return {
    providerId: latest.providerId,
    accountKey: latest.accountKey,
    label: latest.label,
    kind: latest.kind,
    usedPercent: latest.usedPercent,
    resetsAt: latest.resetsAt,
    sampledAt: latest.sampledAt,
    pacePerHour: pace,
    projectedPercent,
    runsOutAt,
    tone,
  };
}

/** How long each kind of window lasts, so its start is its reset less this. */
export const WINDOW_LENGTH: Record<string, number> = { "five-hour": 5 * HOUR, weekly: 7 * 24 * HOUR };

/**
 * A past window whose estimate is under this share of the typical one is
 * left out: bb saw only part of its use, as when the subscription was also
 * used outside bb, and a window can't hold fewer tokens than it was used for.
 */
const LEAST_SIZING_SHARE = 0.25;

/**
 * Below this percent a window's estimate isn't shown: a point of rounding
 * moves it too much, and so does use bb doesn't see early in a session.
 */
export const LEAST_SIZING_PERCENT: Record<string, number> = { "five-hour": 25, weekly: 10 };

/** How many past windows a size reads, newest first. */
const SIZING_WINDOWS = 10;

/**
 * About how many tokens the whole window holds. Each window read far enough
 * in (LEAST_SIZING_PERCENT) gives one estimate: the provider's tokens from
 * its start to its latest such reading, divided by the share used. The
 * typical one is the median of the past windows' estimates. The current
 * window's own estimate counts for as much of the result as the window is
 * used, 40% at 40% used, since early readings are rounded and swing with a
 * cache rewrite or a compaction. A past window under a quarter of the median
 * of every estimate, this window's included, is left out, since use bb
 * didn't see only ever makes an estimate smaller. The limit isn't counted purely in tokens,
 * so this is an estimate either way.
 *
 * Null while no window has been read far enough in; undefined for a window
 * it can't size, one for a single model or of an unknown length, since
 * tokens aren't recorded per model. `samples` are one window key's, oldest
 * first. `tokensBetween` returns null for a stretch whose tokens bb didn't
 * all see, which gives that window no estimate. `since` is when the account
 * last changed limits (rescaledAt): a window that began before it gives no
 * estimate, since its percents are in two limits' units.
 */
export function sizeOf(
  samples: readonly LimitSample[],
  tokensBetween: (from: number, to: number) => number | null,
  since: number | null = null,
): number | null | undefined {
  const latest = samples.at(-1);
  const length = latest === undefined ? undefined : WINDOW_LENGTH[latest.kind];
  if (latest === undefined || latest.model !== null || length === undefined) return undefined;
  const least = LEAST_SIZING_PERCENT[latest.kind]!;
  // Each window's latest reading far enough in, newest window first.
  const readings: Array<{ sample: LimitSample; current: boolean }> = [];
  let resetsAt: number | null = null;
  for (let index = samples.length - 1; index >= 0 && readings.length <= SIZING_WINDOWS; index -= 1) {
    const sample = samples[index]!;
    // Reset times wobble by a few milliseconds between readings.
    if (resetsAt !== null && Math.abs(sample.resetsAt - resetsAt) <= MINUTE) continue;
    if (sample.usedPercent < least || sample.usedPercent > 100) continue;
    resetsAt = sample.resetsAt;
    readings.push({ sample, current: Math.abs(sample.resetsAt - latest.resetsAt) <= MINUTE });
  }
  const estimate = ({ sample }: { sample: LimitSample }) => {
    // A window counted again partway through measures two limits at once.
    if (since !== null && sample.resetsAt - length < since) return null;
    const tokens = tokensBetween(sample.resetsAt - length, sample.sampledAt);
    return tokens !== null && tokens > 0 ? tokens / (sample.usedPercent / 100) : null;
  };
  const current = readings[0]?.current ? estimate(readings[0]) : null;
  const seen = readings
    .filter((reading) => !reading.current)
    .map(estimate)
    .filter((size): size is number => size !== null);
  const everyEstimate = current === null ? seen : [...seen, current];
  const floor = everyEstimate.length === 0 ? 0 : median(everyEstimate)! * LEAST_SIZING_SHARE;
  const typical = median(seen.filter((size) => size >= floor));
  if (current === null) return typical;
  if (typical === null) return current;
  const weight = Math.min(1, latest.usedPercent / 100);
  return weight * current + (1 - weight) * typical;
}

/** The middle of `values`, or the mean of the two middle ones; null when there are none. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2;
}

/**
 * One view per window in the latest reading of each account, session first.
 * A window for one model shows only once it has been used, since most
 * accounts never touch it. Readings older than `staleAfter` are dropped, so a
 * provider that stopped reporting disappears. bb reports one account per
 * provider, so once a provider reports another account, as after signing in
 * to a different one, the previous account's windows are dropped too.
 */
export function limitViews(samples: readonly LimitSample[], now: number, staleAfter: number): LimitView[] {
  const byWindow = new Map<string, LimitSample[]>();
  const providerLatest = new Map<string, number>();
  for (const sample of [...samples].sort((a, b) => a.sampledAt - b.sampledAt)) {
    const key = windowKey(sample);
    byWindow.set(key, [...(byWindow.get(key) ?? []), sample]);
    providerLatest.set(sample.providerId, sample.sampledAt);
  }
  const views: LimitView[] = [];
  for (const windowSamples of byWindow.values()) {
    const latest = windowSamples.at(-1)!;
    if (now - latest.sampledAt > staleAfter) continue;
    if (latest.sampledAt < providerLatest.get(latest.providerId)!) continue;
    if (latest.model !== null && latest.usedPercent === 0) continue;
    views.push(viewOf(windowSamples, now));
  }
  const order = (view: LimitView) => (view.kind === "five-hour" ? 0 : 1);
  return views.sort((a, b) => order(a) - order(b) || a.providerId.localeCompare(b.providerId));
}

/** A stretch of time, with either end open. */
export interface Span {
  from: number;
  to: number;
}

/**
 * When `accountKey` was the account a provider reported. Tokens are recorded
 * per provider, not per account, so these are the stretches whose tokens
 * count toward its limits. Tokens between the last reading of one account
 * and the first of the next count toward the next, since the switch came
 * somewhere in between and the next reading is the one that shows them.
 * Before the first reading counts toward the first account, and after the
 * latest toward the latest.
 */
export function accountSpans(samples: readonly LimitSample[], providerId: string, accountKey: string | null): Span[] {
  const readings = samples.filter((sample) => sample.providerId === providerId).sort((a, b) => a.sampledAt - b.sampledAt);
  const spans: Span[] = [];
  let from: number | null = null;
  let lastMine = -Infinity;
  let previous = -Infinity;
  for (const reading of readings) {
    const mine = reading.accountKey === accountKey;
    if (mine) {
      if (from === null) from = previous;
      lastMine = reading.sampledAt;
    } else if (from !== null) {
      spans.push({ from, to: lastMine });
      from = null;
    }
    previous = reading.sampledAt;
  }
  if (from !== null) spans.push({ from, to: Infinity });
  return spans;
}

/**
 * How long before bb first saw an account a window may start and still be
 * sized from what bb recorded: a poll's gap, and then some, so a session that
 * began just before a switch of accounts is still sized.
 */
const UNSEEN_SLACK = 10 * MINUTE;

/**
 * Whether bb saw the account's use from `from` on: false when the account
 * was first reported after then, since its percent includes use from before
 * it was signed in here.
 */
export function seenSince(spans: readonly Span[], from: number): boolean {
  return spans.length > 0 && spans[0]!.from <= from + UNSEEN_SLACK;
}

/** `tokensBetween` from `from` to `to`, counting only the time inside `spans`. */
export function tokensWithin(
  spans: readonly Span[],
  from: number,
  to: number,
  tokensBetween: (from: number, to: number) => number,
): number {
  let total = 0;
  for (const span of spans) {
    const start = Math.max(from, span.from);
    const end = Math.min(to, span.to);
    if (start < end) total += tokensBetween(start, end);
  }
  return total;
}

/**
 * The readings in one response from bb's usage limits, which maps each
 * provider to its status and windows. Providers that failed or report no
 * windows give none.
 */
export function samplesFromUsage(response: unknown, sampledAt: number): LimitSample[] {
  if (response === null || typeof response !== "object") return [];
  const samples: LimitSample[] = [];
  for (const [providerId, usage] of Object.entries(response as Record<string, unknown>)) {
    const entry = usage as { status?: unknown; accountKey?: unknown; windows?: unknown } | null;
    if (entry?.status !== "ok" || !Array.isArray(entry.windows)) continue;
    const accountKey = typeof entry.accountKey === "string" ? entry.accountKey : null;
    for (const window of entry.windows as Array<Record<string, unknown>>) {
      const resetsAt = typeof window.resetsAt === "string" ? Date.parse(window.resetsAt) : NaN;
      if (typeof window.label !== "string" || typeof window.usedPercent !== "number" || Number.isNaN(resetsAt)) continue;
      samples.push({
        providerId,
        accountKey,
        label: window.label,
        kind: typeof window.kind === "string" ? window.kind : "weekly",
        model: typeof window.model === "string" ? window.model : null,
        sampledAt,
        usedPercent: window.usedPercent,
        resetsAt,
      });
    }
  }
  return samples;
}

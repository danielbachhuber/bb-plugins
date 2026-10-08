// The stages a change passes through, named for the nodes in the delivery
// model, and what the mirror can say about each one.
//
// Every stage is a span with a start and an end. A change that reached the end
// inside the period contributes a duration; one still inside the stage is
// waiting, and contributes its age instead. Durations are business days, so a
// weekend does not read as two days of delay.
import type { PullRequestWithActivity, TimelineItem } from "../mirror/github.js";

import { businessDaysBetween } from "./business-time.js";
import { countedReviews } from "./reviews.js";
import { readyAt } from "./person.js";

export type StageKey = "implement" | "prepare" | "review" | "decision";

export interface StageDefinition {
  key: StageKey;
  /** The node's title in the delivery model. */
  label: string;
  /** What the clock measures, in one line. */
  measures: string;
}

export const STAGES: readonly StageDefinition[] = [
  { key: "implement", label: "Implement change", measures: "opened as a draft, until marked ready for review" },
  { key: "prepare", label: "Prepare pull request", measures: "ready for review, until a reviewer is asked" },
  { key: "review", label: "Code review", measures: "a reviewer asked, until they leave a review" },
  { key: "decision", label: "Merge decision", measures: "approved, until merged" },
];

/** One pull request's span in a stage: finished, or still running. */
export interface StageSpan {
  number: number;
  title: string;
  url: string;
  author: string | null;
  /** When it entered the stage. */
  startedAt: string;
  /** When it left, or null while it is still in the stage. */
  endedAt: string | null;
  /** Business days from `startedAt` to `endedAt`, or to now while it waits. */
  days: number;
}

type RequestEvent = Extract<TimelineItem, { __typename: "ReviewRequestedEvent" | "ReviewRequestRemovedEvent" }>;

function identify(pr: PullRequestWithActivity) {
  return { number: pr.number, title: pr.title, url: pr.url, author: pr.author?.login ?? null };
}

/** When the pull request was last turned back into a draft, or opened as one. */
function draftSince(pr: PullRequestWithActivity): string | null {
  const back = pr.timelineItems.filter((item) => item.__typename === "ConvertToDraftEvent").at(-1);
  if (back !== undefined) return back.createdAt;
  const ready = pr.timelineItems.find((item) => item.__typename === "ReadyForReviewEvent");
  // Opened ready for review: it never spent time as a draft.
  return ready === undefined && !pr.isDraft ? null : pr.createdAt;
}

/** The first time a reviewer was asked, at or after the pull request was ready. */
function firstRequestAfter(pr: PullRequestWithActivity, from: string): string | null {
  const asked = pr.timelineItems.find(
    (item): item is RequestEvent => item.__typename === "ReviewRequestedEvent" && item.createdAt >= from,
  );
  return asked?.createdAt ?? null;
}

/** The first approval that was not later dismissed, oldest first. */
function approvedAt(pr: PullRequestWithActivity): string | null {
  const approval = countedReviews(pr).find((review) => review.state === "APPROVED");
  return approval?.submittedAt ?? null;
}

function span(
  pr: PullRequestWithActivity,
  startedAt: string | null,
  endedAt: string | null,
  now: number,
  stillInStage: boolean,
): StageSpan | null {
  if (startedAt === null) return null;
  if (endedAt === null && !stillInStage) return null;
  const from = Date.parse(startedAt);
  return {
    ...identify(pr),
    startedAt,
    endedAt,
    days: businessDaysBetween(from, endedAt === null ? now : Date.parse(endedAt)),
  };
}

/**
 * Every pull request's span in one stage: those that left it, and those still
 * in it. A pull request appears at most once per stage.
 */
export function stageSpans(
  stage: StageKey,
  prs: readonly PullRequestWithActivity[],
  now: number,
): StageSpan[] {
  const spans: StageSpan[] = [];
  for (const pr of prs) {
    const ready = readyAt(pr);
    let made: StageSpan | null = null;
    switch (stage) {
      case "implement": {
        const started = draftSince(pr);
        made = span(pr, started, pr.isDraft ? null : ready, now, pr.state === "OPEN" && pr.isDraft);
        break;
      }
      case "prepare": {
        const asked = ready === null ? null : firstRequestAfter(pr, ready);
        made = span(pr, ready, asked, now, pr.state === "OPEN" && !pr.isDraft && asked === null);
        break;
      }
      case "review": {
        const asked = ready === null ? null : firstRequestAfter(pr, ready);
        const reviewed =
          asked === null
            ? null
            : (countedReviews(pr).find((review) => review.submittedAt! > asked)?.submittedAt ?? null);
        made = span(pr, asked, reviewed, now, pr.state === "OPEN" && !pr.isDraft && reviewed === null);
        break;
      }
      case "decision": {
        const approved = approvedAt(pr);
        made = span(pr, approved, pr.mergedAt, now, pr.state === "OPEN" && pr.mergedAt === null);
        break;
      }
    }
    if (made !== null) spans.push(made);
  }
  return spans;
}

/** The value at `fraction` of the way through `values`, which must be sorted. */
function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

export interface Percentiles {
  median: number;
  p75: number;
  p90: number;
}

export function percentilesOf(values: readonly number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
  };
}

/** Business-day bands the finished spans are counted into. */
export const SPREAD_BANDS: ReadonlyArray<{ label: string; upTo: number }> = [
  { label: "under 6h", upTo: 0.25 },
  { label: "6h–1d", upTo: 1 },
  { label: "1–2d", upTo: 2 },
  { label: "2–3d", upTo: 3 },
  { label: "3–5d", upTo: 5 },
  { label: "over 5d", upTo: Infinity },
];

/** Business-day bands the waiting spans are counted into. */
export const QUEUE_BANDS: ReadonlyArray<{ label: string; upTo: number; late: boolean }> = [
  { label: "under 1d", upTo: 1, late: false },
  { label: "1–3d", upTo: 3, late: false },
  { label: "3–7d", upTo: 7, late: true },
  { label: "over 7d", upTo: Infinity, late: true },
];

export function countIntoBands<T extends { upTo: number }>(
  bands: readonly T[],
  values: readonly number[],
): Array<T & { count: number }> {
  return bands.map((band, index) => {
    const from = index === 0 ? -Infinity : bands[index - 1].upTo;
    return { ...band, count: values.filter((value) => value > from && value <= band.upTo).length };
  });
}

/** What the dashboard shows for one stage. */
export interface StageSummary extends StageDefinition {
  /** Pull requests that left the stage inside the period. */
  left: number;
  /** Pull requests in the stage now. */
  waiting: number;
  median: number;
  p75: number;
  p90: number;
  /** The median of what left in each bucket; 0 where nothing did. */
  weekly: number[];
}

/** What the stage's own page shows. */
export interface StageDetail extends StageSummary {
  /** Finished spans counted into bands, longest band last. */
  spread: Array<{ label: string; count: number }>;
  /** Waiting spans counted into bands. */
  queue: Array<{ label: string; count: number; late: boolean }>;
  /** How many left in each bucket, and the two marks for that bucket. */
  series: Array<{ label: string; count: number; median: number; p90: number }>;
  /** What is in the stage now, longest wait first. */
  waitingNow: StageSpan[];
}

interface Window {
  start: number;
  end: number;
  label: string;
}

const endedIn = (span: StageSpan, from: number, to: number) =>
  span.endedAt !== null && Date.parse(span.endedAt) >= from && Date.parse(span.endedAt) < to;

function summarise(
  definition: StageDefinition,
  spans: readonly StageSpan[],
  buckets: readonly Window[],
): StageSummary & { finished: StageSpan[]; waitingSpans: StageSpan[] } {
  const from = buckets[0]?.start ?? 0;
  const to = buckets.at(-1)?.end ?? Infinity;
  const finished = spans.filter((span) => endedIn(span, from, to));
  const waitingSpans = spans.filter((span) => span.endedAt === null);
  return {
    ...definition,
    ...percentilesOf(finished.map((span) => span.days)),
    left: finished.length,
    waiting: waitingSpans.length,
    weekly: buckets.map(
      (bucket) =>
        percentilesOf(
          finished.filter((span) => endedIn(span, bucket.start, bucket.end)).map((span) => span.days),
        ).median,
    ),
    finished,
    waitingSpans,
  };
}

/** Every stage, in order, for the dashboard's flow. */
export function stageSummaries(
  prs: readonly PullRequestWithActivity[],
  buckets: readonly Window[],
  now: number,
): StageSummary[] {
  return STAGES.map((definition) => {
    const { finished: _finished, waitingSpans: _waiting, ...summary } = summarise(
      definition,
      stageSpans(definition.key, prs, now),
      buckets,
    );
    return summary;
  });
}

/** One stage, with the detail its own page draws. */
export function stageDetail(
  key: StageKey,
  prs: readonly PullRequestWithActivity[],
  buckets: readonly Window[],
  now: number,
): StageDetail {
  const definition = STAGES.find((stage) => stage.key === key)!;
  const { finished, waitingSpans, ...summary } = summarise(definition, stageSpans(key, prs, now), buckets);
  return {
    ...summary,
    spread: countIntoBands(SPREAD_BANDS, finished.map((span) => span.days)).map(({ label, count }) => ({
      label,
      count,
    })),
    queue: countIntoBands(QUEUE_BANDS, waitingSpans.map((span) => span.days)).map(({ label, count, late }) => ({
      label,
      count,
      late,
    })),
    series: buckets.map((bucket) => {
      const inBucket = finished.filter((span) => endedIn(span, bucket.start, bucket.end)).map((span) => span.days);
      const marks = percentilesOf(inBucket);
      return { label: bucket.label, count: inBucket.length, median: marks.median, p90: marks.p90 };
    }),
    waitingNow: [...waitingSpans].sort((a, b) => b.days - a.days),
  };
}

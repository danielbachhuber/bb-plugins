// One person's small multiple: two lines, a point per day, week, or month,
// named by the section that draws it. Every card in a section shares one y
// scale, so people compare honestly, and the card's own peak is written beside
// the name for the people whose line sits close to the axis on that scale.
import { useState } from "react";

import type { Bucket, BucketUnit } from "@/dashboard/period";
import { peakOf, type VelocityRow } from "@/review/velocity";

export interface SeriesPair {
  first: { label: string; color: string };
  second: { label: string; color: string };
}

// Colours are written out rather than set as Tailwind classes: bb's stylesheet
// is prebuilt, so an arbitrary colour class a plugin invents has no rule.
export const REVIEW_SERIES: SeriesPair = {
  first: { label: "Requested", color: "#3987e5" },
  second: { label: "Given", color: "#1baf7a" },
};

export const AUTHOR_SERIES: SeriesPair = {
  first: { label: "Opened", color: "#3987e5" },
  second: { label: "Merged", color: "#9b6cbf" },
};

/** What a card's peak calls one bucket: "peak 4/day". */
const PER: Record<BucketUnit, string> = { day: "day", week: "wk", month: "mo" };

/** Days and months are labelled by their own date; a week is named by its Monday. */
const TOOLTIP_PREFIX: Record<BucketUnit, string> = { day: "", week: "Week of", month: "" };

const WIDTH = 240;
const HEIGHT = 72;
const PAD_Y = 4;

export function SeriesLegend({ series }: { series: SeriesPair }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {[series.first, series.second].map((line) => (
        <span key={line.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: line.color }} />
          {line.label}
        </span>
      ))}
    </div>
  );
}

export function PersonChart({
  person,
  series,
  buckets,
  max,
  unit,
  peak = false,
  initialHovered,
  onOpenPerson,
}: {
  person: VelocityRow;
  series: SeriesPair;
  buckets: readonly Bucket[];
  /** The largest count on any card, so every card shares one scale. */
  max: number;
  /** What one point counts, which names the peak and heads the tooltip. */
  unit: BucketUnit;
  /** Says what this card's busiest bucket was, for a card that reads flat. */
  peak?: boolean;
  initialHovered?: number;
  /** Opens their page. Left out on their own page, where the name is a heading. */
  onOpenPerson?: (login: string) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(initialHovered ?? null);
  const step = buckets.length > 1 ? WIDTH / (buckets.length - 1) : 0;
  const x = (index: number) => index * step;
  const y = (value: number) => HEIGHT - PAD_Y - (value / Math.max(1, max)) * (HEIGHT - 2 * PAD_Y);
  const path = (values: readonly number[]) => values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join("");
  const lines = [
    { ...series.first, values: person.first, total: person.firstTotal },
    { ...series.second, values: person.second, total: person.secondTotal },
  ];
  const counts = lines.map((line) => `${line.total} ${line.label.toLowerCase()}`).join(" · ");

  return (
    <div className="rounded-lg border border-border bg-card px-3 pb-2 pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        {onOpenPerson === undefined ? (
          <span className="truncate text-sm font-medium">{person.login}</span>
        ) : (
          <button
            type="button"
            onClick={() => onOpenPerson(person.login)}
            className="cursor-pointer truncate text-sm font-medium hover:underline"
          >
            {person.login}
          </button>
        )}
        {peak ? (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">peak {peakOf(person)}/{PER[unit]}</span>
        ) : null}
      </div>
      {/*
        Both totals are named. Neither is a share of the other: a person can
        review a pull request nobody asked them to, and a pull request can
        merge in a week later than the one it was opened in.
      */}
      <div className="text-xs tabular-nums text-muted-foreground">{counts}</div>
      <div className="relative mt-1.5">
        <svg
          viewBox={`-3 0 ${WIDTH + 6} ${HEIGHT}`}
          className="block h-[72px] w-full overflow-visible"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${person.login}: ${counts}`}
          onMouseLeave={() => setHovered(null)}
        >
          <line x1={0} x2={WIDTH} y1={HEIGHT - PAD_Y} y2={HEIGHT - PAD_Y} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {hovered === null ? null : (
            <line x1={x(hovered)} x2={x(hovered)} y1={0} y2={HEIGHT} className="stroke-muted-foreground/40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
          {lines.map((line) => (
            <path
              key={line.label}
              d={path(line.values)}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {buckets.map((bucket, index) => (
            <rect
              key={bucket.start}
              x={x(index) - step / 2}
              y={0}
              width={Math.max(step, 1)}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
            />
          ))}
        </svg>
        {hovered === null ? null : (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
            style={{ left: `${(x(hovered) / WIDTH) * 100}%` }}
          >
            <div className="text-muted-foreground">
              {TOOLTIP_PREFIX[unit]} {buckets[hovered].label}
            </div>
            <div className="tabular-nums">
              {lines.map((line) => `${line.values[hovered]} ${line.label.toLowerCase()}`).join(" · ")}
            </div>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{buckets[0]?.label}</span>
        <span>{buckets.at(-1)?.label}</span>
      </div>
    </div>
  );
}

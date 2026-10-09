// How long something took, per bucket: the median and the p90 as two lines.
//
// The scale is logarithmic. On a real repository the weekly p90 for a merge
// runs to ten business days while the median sits under one, so a straight
// scale presses the median flat against the axis. Gridlines name the steps.
import { useState } from "react";

import type { Turnaround } from "@/dashboard/contract";
import type { Bucket, BucketUnit } from "@/dashboard/period";

import { days } from "./stage-flow";

const WIDTH = 240;
const HEIGHT = 120;
const PAD_Y = 6;

// Colours are written out rather than set as Tailwind classes: bb's stylesheet
// is prebuilt, so an arbitrary colour class a plugin invents has no rule.
const MEDIAN = "#2a78d6";
const P90 = "#c33";

/** Gridlines in business days: an hour, half a working day, a day, three, ten. */
const GRID = [1 / 24, 4 / 24, 1, 3, 10];

/** A gridline's label: whole days without a decimal, as "3d". */
const gridLabel = (value: number) => (value >= 1 ? `${value}d` : days(value));

const TOOLTIP_PREFIX: Record<BucketUnit, string> = { day: "", week: "Week of", month: "" };

export function TimeChart({
  title,
  ended,
  time,
  buckets,
  unit,
}: {
  title: string;
  /** What ending means, plural, for the tooltip: "merged", "reviews". */
  ended: string;
  time: Turnaround;
  buckets: readonly Bucket[];
  unit: BucketUnit;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const top = Math.max(1, ...time.buckets.map((bucket) => bucket.p90), time.p90);
  // Half an hour is the floor: anything quicker reads as "at once".
  const floor = 1 / 48;
  const low = Math.log(floor);
  const high = Math.log(Math.max(top, 1) * 1.2);
  const y = (value: number) =>
    HEIGHT - PAD_Y - ((Math.log(Math.max(value, floor)) - low) / (high - low)) * (HEIGHT - 2 * PAD_Y);
  const step = buckets.length > 1 ? WIDTH / (buckets.length - 1) : 0;
  const x = (index: number) => index * step;

  /** A line through the buckets that had something end, broken where nothing did. */
  const path = (pick: (bucket: Turnaround["buckets"][number]) => number) =>
    time.buckets
      .map((bucket, index) => (bucket.count === 0 ? null : `${x(index)},${y(pick(bucket))}`))
      .reduce<string[]>((segments, point, index, all) => {
        if (point === null) return segments;
        segments.push(`${index === 0 || all[index - 1] === null ? "M" : "L"}${point}`);
        return segments;
      }, [])
      .join("");

  const summary =
    time.count === 0
      ? `none ${ended} in this period`
      : `half within ${days(time.median)} · 1 in 10 over ${days(time.p90)}`;

  return (
    <div className="rounded-lg border border-border bg-card px-3 pb-2 pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-block" style={{ width: 10, height: 2, background: MEDIAN }} />
          median
          <span className="inline-block" style={{ width: 10, height: 0, borderTop: `2px dashed ${P90}` }} />
          p90
        </span>
      </div>
      <div className="text-xs tabular-nums text-muted-foreground">{summary}</div>
      <div className="relative mt-1.5 flex">
        <div className="relative w-7 shrink-0 text-[10px] tabular-nums text-muted-foreground" style={{ height: HEIGHT }}>
          {GRID.filter((value) => value <= Math.exp(high)).map((value) => (
            <span key={value} className="absolute right-1 -translate-y-1/2" style={{ top: `${(y(value) / HEIGHT) * 100}%` }}>
              {gridLabel(value)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`-3 0 ${WIDTH + 6} ${HEIGHT}`}
            className="block w-full overflow-visible"
            style={{ height: HEIGHT }}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${title}: ${summary}`}
            onMouseLeave={() => setHovered(null)}
          >
            {GRID.filter((value) => value <= Math.exp(high)).map((value) => (
              <line key={value} x1={0} x2={WIDTH} y1={y(value)} y2={y(value)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {hovered === null ? null : (
              <line x1={x(hovered)} x2={x(hovered)} y1={0} y2={HEIGHT} className="stroke-muted-foreground/40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
            <path d={path((bucket) => bucket.p90)} fill="none" stroke={P90} strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={path((bucket) => bucket.median)} fill="none" stroke={MEDIAN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
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
                {time.buckets[hovered].count === 0
                  ? `none ${ended}`
                  : `${time.buckets[hovered].count} ${ended} · half within ${days(time.buckets[hovered].median)} · 1 in 10 over ${days(time.buckets[hovered].p90)}`}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-7 text-[11px] text-muted-foreground">
        <span>{buckets[0]?.label}</span>
        <span>{buckets.at(-1)?.label}</span>
      </div>
    </div>
  );
}

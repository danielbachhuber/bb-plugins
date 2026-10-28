// One person's reviews: what was requested of them and what they gave, as a
// pair of bars per bucket with a moving average over each, on the same
// bucket spacing as the pull request chart above it on their page.
import type { Bucket, BucketUnit } from "@/dashboard/period";
import { lastBucketPartial, movingAverage, TREND_LABEL, TREND_WINDOW } from "@/review/trend";

import { REVIEW_SERIES } from "./person-chart";

// The geometry FlowChart uses, so the two charts' buckets line up.
const W = 960;
const H = 230;
const LEFT = 8;
const RIGHT = 8;
const TOP = 22;
const BOTTOM = H - 30;

const UNIT_LABEL: Record<BucketUnit, string> = { day: "", week: "week of ", month: "" };

/** How strongly each part of a requested bar is drawn: asked by name, and picked up for a team. */
const NAMED_OPACITY = 0.6;
const PICKED_UP_OPACITY = 0.22;

export function ReviewLegend({ unit, split = false }: { unit: BucketUnit; split?: boolean }) {
  const swatches = split
    ? [
        { label: "Asked by name", color: REVIEW_SERIES.first.color, opacity: NAMED_OPACITY },
        { label: "Picked up for a team", color: REVIEW_SERIES.first.color, opacity: PICKED_UP_OPACITY + 0.1 },
        { label: REVIEW_SERIES.second.label, color: REVIEW_SERIES.second.color, opacity: 0.6 },
      ]
    : [REVIEW_SERIES.first, REVIEW_SERIES.second].map((series) => ({ ...series, opacity: 0.6 }));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {swatches.map((series) => (
        <span key={series.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block rounded-sm" style={{ width: 9, height: 9, background: series.color, opacity: series.opacity }} />
          {series.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3.5 border-t-2 border-current" />
        {TREND_LABEL[unit]}
      </span>
    </div>
  );
}

export function ReviewChart({
  login,
  requested,
  pickedUp,
  given,
  buckets,
  unit,
  now = Date.now(),
}: {
  login: string;
  requested: readonly number[];
  /** The part of each requested bar made of a team they picked up, drawn lighter on top. */
  pickedUp?: readonly number[];
  given: readonly number[];
  buckets: readonly Bucket[];
  unit: BucketUnit;
  now?: number;
}) {
  const n = buckets.length;
  const slot = (W - LEFT - RIGHT) / Math.max(1, n);
  const bw = Math.min(46, slot * 0.26);
  const center = (i: number) => LEFT + slot * i + slot / 2;
  const x = [(i: number) => center(i) - bw - slot * 0.03, (i: number) => center(i) + slot * 0.03];
  const most = Math.max(1, ...requested, ...given);
  const y = (value: number) => BOTTOM - value * ((BOTTOM - TOP) / most);
  const partial = lastBucketPartial(buckets, now);
  const complete = partial ? n - 1 : n;
  const fontSize = n > 10 ? 10 : 12;

  const series = [
    { ...REVIEW_SERIES.first, values: requested },
    { ...REVIEW_SERIES.second, values: given },
  ].map((line, k) => ({
    ...line,
    x: x[k],
    total: line.values.reduce((sum, value) => sum + value, 0),
    trend: movingAverage(line.values, TREND_WINDOW[unit], complete),
  }));
  const pickedUpTotal = (pickedUp ?? []).reduce((sum, value) => sum + value, 0);
  const counts = series
    .map((line, k) =>
      k === 0 && pickedUpTotal > 0
        ? `${line.total} ${line.label.toLowerCase()} (${line.total - pickedUpTotal} by name, ${pickedUpTotal} picked up for a team)`
        : `${line.total} ${line.label.toLowerCase()}`,
    )
    .join(" · ");

  return (
    <div className="rounded-lg border border-border bg-card px-3 pb-2 pt-2.5">
      <div className="text-sm font-medium">{login}'s reviews</div>
      {/*
        Neither total is a share of the other: a person can review a pull
        request nobody asked them to.
      */}
      <div className="text-xs tabular-nums text-muted-foreground">{counts}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full text-foreground" role="img" aria-label={`${login}'s reviews: ${counts}`}>
        {buckets.map((bucket, i) => (
          <g key={bucket.start} opacity={i >= complete ? 0.45 : 1}>
            {series.map((line, k) => {
              if (k !== 0 || pickedUp === undefined) {
                return <rect key={line.label} x={line.x(i)} y={y(line.values[i])} width={bw} height={BOTTOM - y(line.values[i])} fill={line.color} opacity={0.45} />;
              }
              const named = line.values[i] - pickedUp[i];
              return (
                <g key={line.label}>
                  <rect x={line.x(i)} y={y(named)} width={bw} height={BOTTOM - y(named)} fill={line.color} opacity={NAMED_OPACITY} />
                  <rect x={line.x(i)} y={y(line.values[i])} width={bw} height={y(named) - y(line.values[i])} fill={line.color} opacity={PICKED_UP_OPACITY} />
                </g>
              );
            })}
          </g>
        ))}
        {series.map((line) => (
          <path
            key={line.label}
            d={line.trend
              .map((value, i) => (value === null ? "" : `${i === 0 ? "M" : "L"}${line.x(i) + bw / 2},${y(value)}`))
              .join("")}
            fill="none"
            stroke={line.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* Counts go over the lines, ringed in the card's colour so a line never crosses a number. */}
        {buckets.map((bucket, i) => (
          <g key={bucket.start} opacity={i >= complete ? 0.6 : 1}>
            {series.map((line) => (
              <text
                key={line.label}
                x={line.x(i) + bw / 2}
                y={y(line.values[i]) - 5}
                fontSize={fontSize}
                fontWeight={600}
                textAnchor="middle"
                fill={line.color}
                stroke="var(--card)"
                strokeWidth={4}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {line.values[i]}
              </text>
            ))}
            <text x={center(i)} y={BOTTOM + 15} fontSize={10.5} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
              {UNIT_LABEL[unit]}
              {bucket.label}
              {i === n - 1 && partial ? ", so far" : ""}
            </text>
          </g>
        ))}
        <line x1={LEFT} x2={W - RIGHT} y1={BOTTOM} y2={BOTTOM} stroke="currentColor" strokeOpacity={0.25} />
      </svg>
    </div>
  );
}

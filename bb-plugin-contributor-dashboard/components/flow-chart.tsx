// What arrived and what finished in each bucket, and where each bucket's
// arrivals finished: the chart that opens each velocity section.
//
// Time runs left to right. Each bucket has two bars, as tall as their counts:
// what arrived, then what finished. Work finished in the bucket it arrived in
// moves from one bar to the other in grey. Work that bled into a later bucket
// flows on in amber to the bucket it finished in, and finishes whose arrival
// came before the period enter their bar from just left of it, in amber too.
import type { ReactNode } from "react";

import type { BucketFlows } from "@/dashboard/contract";
import type { Bucket, BucketUnit } from "@/dashboard/period";

import { days } from "./stage-flow";

// Colours are written out rather than set as Tailwind classes: bb's stylesheet
// is prebuilt, so an arbitrary colour class a plugin invents has no rule.
const ARRIVED = "#2a78d6";
const SAME = "#9aa0a6";
const BLED = "#d9820a";

const W = 960;
const LEFT = 8;
const RIGHT = 8;
const TOP = 22;

const UNIT_LABEL: Record<BucketUnit, string> = { day: "", week: "week of ", month: "" };

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block rounded-sm" style={{ width: 9, height: 9, background: color }} />
      {label}
    </span>
  );
}

export function FlowChart({
  title,
  flows,
  buckets,
  unit,
  arrived,
  finished,
  finishedColor,
  openLines,
  now = Date.now(),
}: {
  title: string;
  flows: BucketFlows;
  buckets: readonly Bucket[];
  unit: BucketUnit;
  /** What arriving is called, past tense: "opened", "requested". */
  arrived: string;
  /** What finishing is called, past tense: "merged", "reviewed". */
  finished: string;
  finishedColor: string;
  /** The lines under each bucket about what was unfinished at its end, one short line each. */
  openLines: (index: number) => ReactNode[];
  now?: number;
}) {
  const n = buckets.length;
  const lineCount = n > 10 ? 0 : Math.max(0, ...buckets.map((_, i) => openLines(i).length));
  const H = 250 + lineCount * 15;
  const bottom = H - 30 - lineCount * 15;
  const slot = (W - LEFT - RIGHT) / Math.max(1, n);
  const bw = Math.min(46, slot * 0.26);
  const inX = (i: number) => LEFT + slot * i + slot / 2 - bw - slot * 0.03;
  const outX = (i: number) => LEFT + slot * i + slot / 2 + slot * 0.03;
  const most = Math.max(1, ...flows.started, ...flows.finished);
  const scale = (bottom - TOP) / most;

  // Each band leaves its arrival bar and lands on its finish bar, stacked from
  // the bottom: earlier arrivals land lowest, as they finished first in line.
  const leave = buckets.map(() => bottom);
  const land = buckets.map(() => bottom);
  const bands: ReactNode[] = [];
  const band = (key: string, x0: number, y0: number, x1: number, y1: number, h: number, bled: boolean) => {
    const mid = (x0 + x1) / 2;
    bands.push(
      <path
        key={key}
        d={`M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1} L${x1},${y1 - h} C${mid},${y1 - h} ${mid},${y0 - h} ${x0},${y0 - h} Z`}
        fill={bled ? BLED : SAME}
        opacity={bled ? 0.45 : 0.22}
      />,
    );
  };
  flows.fromEarlier.forEach((count, j) => {
    if (count === 0) return;
    const h = count * scale;
    band(`e${j}`, outX(j) - slot * 0.22, land[j], outX(j), land[j], h, true);
    land[j] -= h;
  });
  flows.flows.forEach((row, i) =>
    row.forEach((count, j) => {
      if (count === 0 || j < i) return;
      const h = count * scale;
      band(`${i}-${j}`, inX(i) + bw, leave[i], outX(j), land[j], h, j > i);
      leave[i] -= h;
      land[j] -= h;
    }),
  );

  const started = flows.started.reduce((sum, count) => sum + count, 0);
  const done = flows.finished.reduce((sum, count) => sum + count, 0);
  // The bucket under way is shorter than the others, or runs past now.
  const last = buckets.at(-1);
  const full = n > 1 ? buckets[1].end - buckets[1].start : 0;
  const partial = last !== undefined && (last.end > now || last.end - last.start < full * 0.9);

  return (
    <div className="mt-3 rounded-lg border border-border bg-card px-3 pb-2 pt-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <Swatch color={ARRIVED} label={arrived} />
          <Swatch color={finishedColor} label={finished} />
          <Swatch color={SAME} label={`${finished} the same ${unit}`} />
          <Swatch color={BLED} label={`bled into a later ${unit}`} />
        </span>
      </div>
      <div className="text-xs tabular-nums text-muted-foreground">
        {started} {arrived} · {done} {finished}
        {done === 0 ? null : (
          <>
            {" "}
            · half {finished} within <span className="font-medium text-foreground">{days(flows.median)}</span>, 1 in 10
            after <span className="font-medium text-foreground">{days(flows.p90)}</span>
          </>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full text-foreground" role="img" aria-label={`${title}: ${started} ${arrived}, ${done} ${finished}`}>
        {bands}
        {buckets.map((bucket, i) => {
          const a = flows.started[i];
          const f = flows.finished[i];
          const last = i === n - 1;
          return (
            <g key={bucket.start}>
              <rect x={inX(i)} y={bottom - a * scale} width={bw} height={a * scale} fill={ARRIVED} opacity={0.75} />
              <text x={inX(i) + bw / 2} y={bottom - a * scale - 5} fontSize={n > 10 ? 10 : 12} fontWeight={600} textAnchor="middle" fill={ARRIVED}>
                {a}
              </text>
              <rect x={outX(i)} y={bottom - f * scale} width={bw} height={f * scale} fill={finishedColor} opacity={0.8} />
              <text x={outX(i) + bw / 2} y={bottom - f * scale - 5} fontSize={n > 10 ? 10 : 12} fontWeight={600} textAnchor="middle" fill={finishedColor}>
                {f}
              </text>
              <text x={LEFT + slot * i + slot / 2} y={bottom + 15} fontSize={10.5} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
                {UNIT_LABEL[unit]}
                {bucket.label}
                {last && partial ? ", so far" : ""}
              </text>
              {n > 10
                ? null
                : openLines(i).map((line, k) => (
                    <text key={k} x={LEFT + slot * i + slot / 2} y={bottom + 31 + k * 15} fontSize={10.5} textAnchor="middle" fill="currentColor" fillOpacity={0.75}>
                      {line}
                    </text>
                  ))}
            </g>
          );
        })}
        <line x1={LEFT} x2={W - RIGHT} y1={bottom} y2={bottom} stroke="currentColor" strokeOpacity={0.25} />
      </svg>
    </div>
  );
}

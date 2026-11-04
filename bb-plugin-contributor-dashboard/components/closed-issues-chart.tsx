// The issues closed in each bucket, as one bar each: completed issues stacked
// by issue type, then those closed as not planned or duplicate hatched on
// top, so a week of cleanup does not read as a week of finished work.
import { useId, type ReactNode } from "react";

import type { ClosedIssues } from "@/dashboard/contract";
import type { Bucket, BucketUnit } from "@/dashboard/period";
import { lastBucketPartial } from "@/review/trend";

// Colours are written out rather than set as Tailwind classes: bb's stylesheet
// is prebuilt, so an arbitrary colour class a plugin invents has no rule.
// Bugs are red and features green, as people expect of them; Task takes the
// releases section's slate for chores. A type the organization added takes
// the next colour left.
const KNOWN: Record<string, string> = { Bug: "#e5484d", Feature: "#1baf7a", Task: "#7c8794" };
const SPARE = ["#9b6cbf", "#d9820a", "#3fa7b5", "#5b6ee1"];
const NO_TYPE = "#cdd3da";
const SLATE = "#7c8794";
const DUPLICATE = "#b9c2cc";

const W = 960;
const LEFT = 8;
const RIGHT = 8;
const TOP = 22;
const H = 230;

const UNIT_LABEL: Record<BucketUnit, string> = { day: "", week: "week of ", month: "" };

/** Each type's colour, and the label its legend and tooltip use. */
export function typeColors(names: ReadonlyArray<string | null>): Array<{ label: string; color: string }> {
  let spare = 0;
  return names.map((name) => {
    if (name === null) return { label: "No type", color: NO_TYPE };
    return { label: name, color: KNOWN[name] ?? SPARE[spare++ % SPARE.length] };
  });
}

function Swatch({ color, label, hatch = false }: { color: string; label: string; hatch?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-sm"
        style={{
          width: 9,
          height: 9,
          background: hatch ? `repeating-linear-gradient(135deg, ${color} 0 1.5px, transparent 1.5px 3.5px)` : color,
          boxShadow: hatch ? `inset 0 0 0 1px ${color}` : undefined,
        }}
      />
      {label}
    </span>
  );
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export function ClosedIssuesChart({
  closed,
  buckets,
  unit,
  emptyNote,
  now = Date.now(),
}: {
  closed: ClosedIssues;
  buckets: readonly Bucket[];
  unit: BucketUnit;
  /** What to say when nothing closed in the period. */
  emptyNote: string;
  now?: number;
}) {
  // useId's colons are awkward inside url(#…), so the pattern ids drop them.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const n = buckets.length;
  const styles = typeColors(closed.types.map((type) => type.name));
  const totals = buckets.map(
    (_, i) => closed.types.reduce((total, type) => total + type.completed[i], 0) + closed.notPlanned[i] + closed.duplicate[i],
  );
  const completed = sum(closed.types.map((type) => sum(type.completed)));
  const notPlanned = sum(closed.notPlanned);
  const duplicate = sum(closed.duplicate);
  const all = completed + notPlanned + duplicate;
  const untyped = closed.types.find((type) => type.name === null);
  const partial = lastBucketPartial(buckets, now);

  const bottom = H - 30;
  const slot = (W - LEFT - RIGHT) / Math.max(1, n);
  const bw = Math.min(64, slot * 0.42);
  const x = (i: number) => LEFT + slot * i + slot / 2 - bw / 2;
  const scale = (bottom - TOP) / Math.max(1, ...totals);
  const notPlannedFill = `url(#${id}-np)`;
  const duplicateFill = `url(#${id}-dup)`;

  return (
    <div className="mt-3 rounded-lg border border-border bg-card px-3 pb-2 pt-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">All closed issues</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {closed.types.map((type, k) => (
            <Swatch key={type.name ?? ""} color={styles[k].color} label={styles[k].label} />
          ))}
          {notPlanned === 0 ? null : <Swatch color={SLATE} label="not planned" hatch />}
          {duplicate === 0 ? null : <Swatch color={DUPLICATE} label="duplicate" hatch />}
        </span>
      </div>
      {all === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{emptyNote}</p>
      ) : (
        <>
          <div className="text-xs tabular-nums text-muted-foreground">
            {all} closed · <span className="font-medium text-foreground">{completed}</span> completed · {notPlanned} not planned ·{" "}
            {duplicate} duplicate
            {untyped === undefined || completed === 0 ? null : (
              <> · {Math.round((sum(untyped.completed) / completed) * 100)}% of completed have no type</>
            )}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full text-foreground" role="img" aria-label={`Closed issues: ${all} closed, ${completed} completed`}>
            <defs>
              <pattern id={`${id}-np`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill={SLATE} fillOpacity={0.12} />
                <line x1="0" y1="0" x2="0" y2="5" stroke={SLATE} strokeWidth="2" strokeOpacity={0.7} />
              </pattern>
              <pattern id={`${id}-dup`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill={SLATE} fillOpacity={0.06} />
                <line x1="0" y1="0" x2="0" y2="5" stroke={SLATE} strokeWidth="1" strokeOpacity={0.45} />
              </pattern>
            </defs>
            {buckets.map((bucket, i) => {
              let y = bottom;
              const segments: ReactNode[] = [];
              const stack = (key: string, count: number, fill: string, title: string, hatched: boolean) => {
                if (count === 0) return;
                const h = count * scale;
                y -= h;
                segments.push(
                  <rect
                    key={key}
                    x={x(i)}
                    y={y}
                    width={bw}
                    height={h}
                    fill={fill}
                    stroke={hatched ? SLATE : "var(--color-card, #fff)"}
                    strokeOpacity={hatched ? 0.5 : 1}
                    strokeWidth={hatched ? 0.75 : 1}
                  >
                    <title>{`${count} ${title}`}</title>
                  </rect>,
                );
              };
              closed.types.forEach((type, k) =>
                stack(type.name ?? "", type.completed[i], styles[k].color, `${styles[k].label} completed`, false),
              );
              stack("np", closed.notPlanned[i], notPlannedFill, "not planned", true);
              stack("dup", closed.duplicate[i], duplicateFill, "duplicate", true);
              return (
                <g key={bucket.start}>
                  {segments}
                  {totals[i] === 0 ? null : (
                    <text x={x(i) + bw / 2} y={y - 5} fontSize={n > 10 ? 10 : 12} fontWeight={600} textAnchor="middle" fill="currentColor">
                      {totals[i]}
                    </text>
                  )}
                  <text x={LEFT + slot * i + slot / 2} y={bottom + 15} fontSize={10.5} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
                    {UNIT_LABEL[unit]}
                    {bucket.label}
                    {i === n - 1 && partial ? ", so far" : ""}
                  </text>
                </g>
              );
            })}
            <line x1={LEFT} x2={W - RIGHT} y1={bottom} y2={bottom} stroke="currentColor" strokeOpacity={0.25} />
          </svg>
        </>
      )}
    </div>
  );
}

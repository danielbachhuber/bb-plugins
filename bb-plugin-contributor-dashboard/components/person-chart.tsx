// One person's small multiple: reviews requested of them and given by them,
// per week or month. Every card shares one y scale so people compare honestly.
import { useState } from "react";

import type { Bucket } from "@/dashboard/period";
import type { PersonActivity } from "@/review/people";

export const SERIES = [
  { key: "requested", label: "Requested", stroke: "stroke-[#2a78d6] dark:stroke-[#3987e5]", swatch: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { key: "given", label: "Given", stroke: "stroke-[#1baf7a] dark:stroke-[#199e70]", swatch: "bg-[#1baf7a] dark:bg-[#199e70]" },
] as const;

const WIDTH = 240;
const HEIGHT = 72;
const PAD_Y = 4;

export function SeriesLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {SERIES.map((series) => (
        <span key={series.key} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-0.5 w-3 rounded ${series.swatch}`} />
          {series.label}
        </span>
      ))}
    </div>
  );
}

export function PersonChart({
  person,
  buckets,
  max,
  unit,
  initialHovered,
  onOpenPerson,
}: {
  person: PersonActivity;
  buckets: readonly Bucket[];
  /** The largest count on any card, so every card shares one scale. */
  max: number;
  unit: "Week of" | "";
  initialHovered?: number;
  /** Opens their page. Left out on their own page, where the name is a heading. */
  onOpenPerson?: (login: string) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(initialHovered ?? null);
  const step = buckets.length > 1 ? WIDTH / (buckets.length - 1) : 0;
  const x = (index: number) => index * step;
  const y = (value: number) => HEIGHT - PAD_Y - (value / Math.max(1, max)) * (HEIGHT - 2 * PAD_Y);
  const path = (values: readonly number[]) => values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join("");

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
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {person.givenTotal} of {person.requestedTotal}
        </span>
      </div>
      <div className="relative mt-1.5">
        <svg
          viewBox={`-3 0 ${WIDTH + 6} ${HEIGHT}`}
          className="block h-[72px] w-full overflow-visible"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${person.login}: ${person.requestedTotal} reviews requested, ${person.givenTotal} given`}
          onMouseLeave={() => setHovered(null)}
        >
          <line x1={0} x2={WIDTH} y1={HEIGHT - PAD_Y} y2={HEIGHT - PAD_Y} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {hovered === null ? null : (
            <line x1={x(hovered)} x2={x(hovered)} y1={0} y2={HEIGHT} className="stroke-muted-foreground/40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
          {SERIES.map((series) => (
            <path
              key={series.key}
              d={path(person[series.key])}
              fill="none"
              className={series.stroke}
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
              {unit} {buckets[hovered].label}
            </div>
            <div className="tabular-nums">
              {person.requested[hovered]} requested · {person.given[hovered]} given
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

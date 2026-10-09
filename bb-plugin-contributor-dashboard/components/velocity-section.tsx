// A section of small multiples: a card per person, busiest first, and the
// quiet tail as rows of names and counts until Show all opens them.
import { useState, type ReactNode } from "react";

import type { Bucket, BucketUnit } from "@/dashboard/period";
import { foldRows, type VelocityRow } from "@/review/velocity";

import { PersonChart, SeriesLegend, type SeriesPair } from "./person-chart";

export function VelocitySection({
  id,
  heading,
  title,
  note,
  rows,
  series,
  buckets,
  unit,
  emptyNote,
  initialHovered,
  showAll: initialShowAll = false,
  onOpenPerson,
  overview,
}: {
  id: string;
  heading: string;
  title: string;
  note: string;
  rows: readonly VelocityRow[];
  series: SeriesPair;
  buckets: readonly Bucket[];
  /** What one point counts, which names the peak and the fold. */
  unit: BucketUnit;
  /** What to say when nobody did anything in the period. */
  emptyNote: string;
  initialHovered?: number;
  /** Starts with the tail opened, for a story. */
  showAll?: boolean;
  onOpenPerson: (login: string) => void;
  /** A chart for everyone together, drawn under the heading before the per-person cards. */
  overview?: ReactNode;
}) {
  const [showAll, setShowAll] = useState(initialShowAll);
  const { charted, folded, max } = foldRows(rows);
  const cards = showAll ? [...charted, ...folded] : charted;

  return (
    <section className="mt-6" aria-labelledby={id}>
      <h2 id={id} className="text-base font-semibold">
        {heading}
      </h2>
      {overview}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          {title}
          <span className="ml-2 font-normal text-muted-foreground">{note}</span>
        </h3>
        <SeriesLegend series={series} />
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyNote}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {cards.map((person, index) => (
              <PersonChart
                key={person.login}
                person={person}
                series={series}
                buckets={buckets}
                max={max}
                unit={unit}
                peak
                initialHovered={index === 0 ? initialHovered : undefined}
                onOpenPerson={onOpenPerson}
              />
            ))}
          </div>

          {folded.length === 0 ? null : (
            <>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <h4 className="text-xs font-medium text-muted-foreground">
                  {folded.length} more {folded.length === 1 ? "person" : "people"}, whose busiest {unit} is under a
                  tenth of the scale
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground"
                >
                  {showAll ? "Fold them back" : "Show all"}
                </button>
              </div>
              {showAll ? null : (
                <div className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-3 gap-y-1 text-xs">
                  {folded.map((person) => (
                    <button
                      key={person.login}
                      type="button"
                      onClick={() => onOpenPerson(person.login)}
                      className="flex cursor-pointer items-baseline justify-between gap-2 border-b border-border py-1 text-left hover:bg-muted"
                    >
                      <span className="truncate font-medium">{person.login}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {person.firstTotal} {series.first.label.toLowerCase()} · {person.secondTotal}{" "}
                        {series.second.label.toLowerCase()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

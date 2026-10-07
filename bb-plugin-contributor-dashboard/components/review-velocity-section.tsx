// The Review Velocity section: one small chart per person of the reviews
// requested of them and the reviews they gave.
import type { Bucket, PeriodId } from "@/dashboard/period";
import type { PersonActivity } from "@/review/people";

import { PersonChart, SeriesLegend } from "./person-chart";

export function ReviewVelocitySection({
  buckets,
  people,
  period,
  syncing,
  initialHovered,
}: {
  buckets: readonly Bucket[];
  people: readonly PersonActivity[];
  period: PeriodId;
  /** A sync is still storing pages, so an empty period may fill in. */
  syncing: boolean;
  initialHovered?: number;
}) {
  const max = Math.max(0, ...people.flatMap((person) => [...person.requested, ...person.given]));
  const unit = period === "6w" || period === "12w" ? "Week of" : "";

  return (
    <section className="mt-6" aria-labelledby="review-velocity">
      <h2 id="review-velocity" className="text-base font-semibold">
        Review velocity
      </h2>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          Reviews per person
          <span className="ml-2 font-normal text-muted-foreground">requested of each person, and given by them</span>
        </h3>
        <SeriesLegend />
      </div>

      {people.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {syncing ? "Nothing in this period yet. The sync is still running." : "No review requests or reviews in this period."}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {people.map((person, index) => (
            <PersonChart
              key={person.login}
              person={person}
              buckets={buckets}
              max={max}
              unit={unit}
              initialHovered={index === 0 ? initialHovered : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

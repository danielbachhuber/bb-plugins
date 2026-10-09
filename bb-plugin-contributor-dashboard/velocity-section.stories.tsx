import { VelocitySection } from "./components/velocity-section";
import { AUTHOR_SERIES } from "./components/person-chart";
import { bucketsFor, rangeOf, unitOfBuckets } from "./dashboard/period";
import type { VelocityRow } from "./review/velocity";

export default {
  title: "contributor-dashboard/Velocity section",
};

const NOW = new Date(2026, 9, 7, 14, 20).getTime();
const buckets = bucketsFor(rangeOf({ kind: "preset", id: "6w" }, NOW));

/** Invented, with a real repository's skew: three people and a long tail. */
const TOTALS: Array<[string, number, number]> = [
  ["octocat", 132, 108],
  ["hubber", 119, 94],
  ["mona", 76, 60],
  ["monalisa", 25, 19],
  ["spacecat", 21, 17],
  ["webcat", 9, 7],
  ["yeti", 7, 5],
  ["dinotocat", 6, 5],
  ["wavetocat", 5, 4],
  ["snowtocat", 5, 4],
  ["mountietocat", 3, 2],
  ["jetpacktocat", 3, 2],
  ["bannekat", 3, 2],
  ["inspectocat", 2, 2],
  ["welderocat", 2, 1],
  ["baracktocat", 1, 0],
  ["swagtocat", 1, 0],
];

const spread = (total: number, seed: number): number[] => {
  const weights = buckets.map((_, i) => 1 + (((i + 2) * (seed + 5) * 7919) % 7) / 7);
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((weight) => Math.round((weight / sum) * total));
  counts[0] += total - counts.reduce((a, b) => a + b, 0);
  return counts.map((count) => Math.max(0, count));
};

const ROWS: VelocityRow[] = TOTALS.map(([login, opened, merged], index) => ({
  login,
  first: spread(opened, index + 1),
  second: spread(merged, index + 2),
  firstTotal: opened,
  secondTotal: merged,
}));

function Section({ showAll }: { showAll?: boolean }) {
  return (
    <div className="mx-auto box-border w-full max-w-5xl px-5 py-4">
      <VelocitySection
        id="pr-velocity"
        heading="PR velocity"
        title="Pull requests per person"
        note="opened by each person, and merged"
        rows={ROWS}
        series={AUTHOR_SERIES}
        buckets={buckets}
        unit={unitOfBuckets(buckets)}
        emptyNote="No pull requests opened or merged in this period."
        showAll={showAll}
        onOpenPerson={() => undefined}
      />
    </div>
  );
}

/** The quiet people are rows of counts: a line under a tenth of the scale has no shape to read. */
export const Folded = () => <Section />;

/** Show all draws everyone, on the same scale, however flat that leaves them. */
export const ShowAll = () => <Section showAll />;

/** Nobody opened anything in the period. */
export const Empty = () => (
  <div className="mx-auto box-border w-full max-w-5xl px-5 py-4">
    <VelocitySection
      id="pr-velocity"
      heading="PR velocity"
      title="Pull requests per person"
      note="opened by each person, and merged"
      rows={[]}
      series={AUTHOR_SERIES}
      buckets={buckets}
      unit={unitOfBuckets(buckets)}
      emptyNote="No pull requests opened or merged in this period."
      onOpenPerson={() => undefined}
    />
  </div>
);

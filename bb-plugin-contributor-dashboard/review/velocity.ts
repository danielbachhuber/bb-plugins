// What the two velocity sections have in common: a person, two weekly lines,
// and the rule for which people keep a chart. Pure, so the rule has a test.

export interface VelocityRow {
  login: string;
  /** The line drawn first: reviews requested, or pull requests opened. */
  first: number[];
  /** The line drawn second: reviews given, or pull requests merged. */
  second: number[];
  firstTotal: number;
  secondTotal: number;
}

/** The busiest bucket on either line, which is what the card's peak reports. */
export const peakOf = (row: VelocityRow): number => Math.max(0, ...row.first, ...row.second);

/**
 * A line under a tenth of the section's scale is a few pixels off the axis
 * whatever its shape, so the people below that read as rows of numbers
 * instead. Everyone is still named, and Show all draws them all.
 */
export const CHART_SHARE = 0.1;

export interface Folded {
  /** Busiest first, the ones whose line is tall enough to read. */
  charted: VelocityRow[];
  /** The rest, in the same order. */
  folded: VelocityRow[];
  /** The scale every chart shares: the busiest bucket of anyone. */
  max: number;
}

/** Busiest first, with the quiet tail split off. Ties sort by name. */
export function foldRows(rows: readonly VelocityRow[]): Folded {
  const sorted = [...rows].sort(
    (a, b) =>
      b.firstTotal + b.secondTotal - (a.firstTotal + a.secondTotal) ||
      a.login.localeCompare(b.login, "en", { sensitivity: "base" }),
  );
  const max = Math.max(0, ...sorted.map(peakOf));
  const threshold = max * CHART_SHARE;
  return {
    charted: sorted.filter((row) => peakOf(row) >= threshold && peakOf(row) > 0),
    folded: sorted.filter((row) => peakOf(row) < threshold || peakOf(row) === 0),
    max,
  };
}

/** A reviewer's row: requests made of them, and reviews they gave. */
export const reviewerRow = (person: {
  login: string;
  requested: number[];
  given: number[];
  requestedTotal: number;
  givenTotal: number;
}): VelocityRow => ({
  login: person.login,
  first: person.requested,
  second: person.given,
  firstTotal: person.requestedTotal,
  secondTotal: person.givenTotal,
});

/** An author's row: pull requests they opened, and the ones that merged. */
export const authorRow = (person: {
  login: string;
  opened: number[];
  merged: number[];
  openedTotal: number;
  mergedTotal: number;
}): VelocityRow => ({
  login: person.login,
  first: person.opened,
  second: person.merged,
  firstTotal: person.openedTotal,
  secondTotal: person.mergedTotal,
});

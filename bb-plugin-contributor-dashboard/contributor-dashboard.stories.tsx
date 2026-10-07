import { useState } from "react";

import { DashboardView } from "./components/dashboard-view";
import type { PeopleActivityResult, SyncStatus } from "./dashboard/contract";
import { bucketsFor, type PeriodId } from "./dashboard/period";

export default {
  title: "contributor-dashboard/Page",
};

const NOW = new Date(2026, 9, 7, 14, 20).getTime();

const SYNCED: SyncStatus = { syncedAt: NOW - 12 * 60_000, running: false, backfillDone: true, pullRequests: 1_284, error: null };

/** Invented reviewers, each with a weekly rhythm and a share of requests they answer. */
const PEOPLE: Array<{ login: string; base: number; answers: number; trend: number }> = [
  { login: "hubber", base: 5, answers: 0.85, trend: -0.1 },
  { login: "mona", base: 7, answers: 0.55, trend: 0.25 },
  { login: "monalisa", base: 3.5, answers: 1, trend: 0 },
  { login: "octocat", base: 8, answers: 0.7, trend: 0.15 },
  { login: "spacecat", base: 2, answers: 1.1, trend: -0.05 },
  { login: "thehubbot", base: 4.5, answers: 0.9, trend: 0.05 },
  { login: "webcat", base: 6, answers: 0.8, trend: 0.2 },
  { login: "yeti", base: 3, answers: 0.75, trend: 0 },
];

function fixture(period: PeriodId, sync: SyncStatus = SYNCED): PeopleActivityResult {
  const buckets = bucketsFor(period, NOW);
  const perBucket = period === "6w" || period === "12w" ? 1 : 4.3;
  const people = PEOPLE.map(({ login, base, answers, trend }, p) => {
    const requested = buckets.map((_, i) => {
      const wobble = (((i + 3) * (p + 5) * 7919) % 11) / 11 - 0.5;
      return Math.max(0, Math.round((base + trend * i + wobble * 3) * perBucket));
    });
    const given = requested.map((count, i) => Math.max(0, Math.round(count * answers + ((i * (p + 2)) % 3) - 1)));
    return {
      login,
      requested,
      given,
      requestedTotal: requested.reduce((a, b) => a + b, 0),
      givenTotal: given.reduce((a, b) => a + b, 0),
    };
  });
  return { repository: "acme/widgets", buckets, people, sync };
}

function Page({ initial = "6w", sync, initialHovered }: { initial?: PeriodId; sync?: SyncStatus; initialHovered?: number }) {
  const [period, setPeriod] = useState<PeriodId>(initial);
  return (
    <DashboardView
      period={period}
      onPeriod={setPeriod}
      data={fixture(period, sync)}
      error={null}
      onSync={() => undefined}
      now={NOW}
      initialHovered={initialHovered}
    />
  );
}

/** Six weeks, the default: one small chart per person, alphabetical, all on one scale. */
export const SixWeeks = () => <Page />;

/** Hovering a week shows that week's requested and given counts. */
export const SixWeeksHovered = () => <Page initialHovered={3} />;

/** A year, drawn by month. */
export const OneYear = () => <Page initial="1y" />;

/** The first sync, still reaching back two years; the charts fill in as pages arrive. */
export const FirstSync = () => (
  <Page sync={{ syncedAt: null, running: true, backfillDone: false, pullRequests: 350, error: null }} />
);

/** Before a repository is set. */
export const NoRepository = () => (
  <DashboardView
    period="6w"
    onPeriod={() => undefined}
    data={{ repository: null, buckets: [], people: [], sync: { ...SYNCED, syncedAt: null, pullRequests: 0 } }}
    error={null}
    onSync={() => undefined}
    now={NOW}
  />
);

/** A sync that failed, such as gh not being signed in. */
export const SyncFailed = () => (
  <Page sync={{ ...SYNCED, error: "`gh` is not authenticated. Run `gh auth login`." }} />
);

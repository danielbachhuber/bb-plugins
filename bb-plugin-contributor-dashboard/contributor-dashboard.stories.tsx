import { useState } from "react";

import { DashboardView } from "./components/dashboard-view";
import { PersonView } from "./components/person-view";
import type { PeopleActivityResult, SyncStatus } from "./dashboard/contract";
import { PAGE_SIZE, pageOf } from "./dashboard/paging";
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
      onOpenPerson={() => undefined}
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
    onOpenPerson={() => undefined}
    now={NOW}
  />
);

/** A sync that failed, such as gh not being signed in. */
export const SyncFailed = () => (
  <Page sync={{ ...SYNCED, error: "`gh` is not authenticated. Run `gh auth login`." }} />
);

const AWAITING = [
  { number: 1840, title: "Add retry to widget sync", url: "https://github.com/acme/widgets/pull/1840", author: "mona", requestedAt: "2026-10-02T09:00:00Z", waitingDays: 3.2 },
  { number: 1831, title: "Rename sprocket fields", url: "https://github.com/acme/widgets/pull/1831", author: "webcat", requestedAt: "2026-10-05T14:00:00Z", waitingDays: 1.9 },
  { number: 1828, title: "Cache avatar lookups", url: "https://github.com/acme/widgets/pull/1828", author: "yeti", requestedAt: "2026-10-06T10:00:00Z", waitingDays: 0.8 },
];

const AUTHORED = [
  { number: 1837, title: "Paginate gadget search", url: "https://github.com/acme/widgets/pull/1837", state: "OPEN" as const, isDraft: false, createdAt: "2026-10-05T09:00:00Z", firstReviewDays: 0.6, followUps: 1, mergeDays: null, waitingDays: 2.1 },
  { number: 1822, title: "Validate webhook payloads", url: "https://github.com/acme/widgets/pull/1822", state: "MERGED" as const, isDraft: false, createdAt: "2026-09-29T09:00:00Z", firstReviewDays: 1.4, followUps: 2, mergeDays: 3.7, waitingDays: null },
  { number: 1816, title: "Upgrade chart library", url: "https://github.com/acme/widgets/pull/1816", state: "MERGED" as const, isDraft: false, createdAt: "2026-09-24T09:00:00Z", firstReviewDays: 0.3, followUps: 0, mergeDays: 1.1, waitingDays: null },
  { number: 1807, title: "Show empty state on list", url: "https://github.com/acme/widgets/pull/1807", state: "OPEN" as const, isDraft: true, createdAt: "2026-09-21T09:00:00Z", firstReviewDays: null, followUps: 0, mergeDays: null, waitingDays: null },
  { number: 1801, title: "Remove unused flags", url: "https://github.com/acme/widgets/pull/1801", state: "CLOSED" as const, isDraft: false, createdAt: "2026-09-18T09:00:00Z", firstReviewDays: 2.2, followUps: 1, mergeDays: null, waitingDays: null },
];

/** Enough pull requests to page through, by repeating the five above. */
function manyAuthored(total: number) {
  return Array.from({ length: total }, (_, index) => ({
    ...AUTHORED[index % AUTHORED.length],
    number: 1837 - index * 3,
  }));
}

function Person({
  initial = "6w",
  awaiting = AWAITING,
  authored = AUTHORED,
  login = "octocat",
}: {
  initial?: PeriodId;
  awaiting?: typeof AWAITING;
  authored?: typeof AUTHORED;
  login?: string;
}) {
  const [period, setPeriod] = useState<PeriodId>(initial);
  const [authoredPage, setAuthoredPage] = useState(0);
  const page = fixture(period);
  const paging = pageOf(authored.length, authoredPage);
  return (
    <PersonView
      login={login}
      period={period}
      onPeriod={setPeriod}
      data={{
        repository: "acme/widgets",
        login,
        buckets: page.buckets,
        activity: page.people.find((person) => person.login === login) ?? null,
        awaiting,
        authored: authored.slice(paging.offset, paging.offset + PAGE_SIZE),
        authoredPaging: { page: paging.page, pages: paging.pages, from: paging.from, to: paging.to, total: authored.length },
        sync: SYNCED,
      }}
      error={null}
      onBack={() => undefined}
      onAuthoredPage={setAuthoredPage}
      now={NOW}
    />
  );
}

/** One person's page, reached by clicking their name on the dashboard. */
export const PersonPage = () => <Person />;

/** A prolific author: their pull requests page 25 at a time. */
export const PersonPagePaged = () => <Person authored={manyAuthored(118)} />;

/** Nobody is waiting on them and they have opened nothing this period. */
export const PersonPageQuiet = () => <Person login="spacecat" awaiting={[]} authored={[]} />;

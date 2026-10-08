import { useState } from "react";

import { DashboardView } from "./components/dashboard-view";
import { PersonView } from "./components/person-view";
import { StageView } from "./components/stage-view";
import type { PeopleActivityResult, StageDetailResult, StageSummary, SyncStatus } from "./dashboard/contract";
import { PAGE_SIZE, pageOf } from "./dashboard/paging";
import { bucketsFor, PERIOD_LENGTHS, type PeriodId } from "./dashboard/period";

export default {
  title: "contributor-dashboard/Page",
};

const NOW = new Date(2026, 9, 7, 14, 20).getTime();

const SYNCED: SyncStatus = {
  syncedAt: NOW - 12 * 60_000,
  running: false,
  backfillDone: true,
  pullRequests: 1_284,
  issues: 412,
  error: null,
};

/**
 * Invented people, with a real repository's shape: three of them open and
 * review most of the work, and a dozen appear once or twice, so the page has
 * a tail to fold. Each row is six weeks of totals.
 */
const PEOPLE: Array<{ login: string; opened: number; merged: number; requested: number; given: number }> = [
  { login: "octocat", opened: 132, merged: 108, requested: 53, given: 108 },
  { login: "hubber", opened: 119, merged: 94, requested: 66, given: 83 },
  { login: "mona", opened: 76, merged: 60, requested: 34, given: 61 },
  { login: "monalisa", opened: 25, merged: 19, requested: 16, given: 23 },
  { login: "spacecat", opened: 21, merged: 17, requested: 14, given: 19 },
  { login: "webcat", opened: 9, merged: 7, requested: 9, given: 12 },
  { login: "yeti", opened: 7, merged: 5, requested: 8, given: 9 },
  { login: "dinotocat", opened: 6, merged: 5, requested: 5, given: 7 },
  { login: "wavetocat", opened: 5, merged: 4, requested: 4, given: 6 },
  { login: "snowtocat", opened: 5, merged: 4, requested: 4, given: 5 },
  { login: "mountietocat", opened: 3, merged: 2, requested: 3, given: 4 },
  { login: "jetpacktocat", opened: 3, merged: 2, requested: 2, given: 3 },
  { login: "bannekat", opened: 3, merged: 2, requested: 2, given: 2 },
  { login: "inspectocat", opened: 2, merged: 2, requested: 1, given: 2 },
  { login: "welderocat", opened: 2, merged: 1, requested: 1, given: 1 },
  { login: "baracktocat", opened: 1, merged: 0, requested: 0, given: 1 },
  { login: "swagtocat", opened: 1, merged: 0, requested: 0, given: 0 },
];

/** A person's weekly rhythm: uneven, repeatable, and the same shape each period. */
const rhythm = (seed: number, buckets: number): number[] =>
  Array.from({ length: buckets }, (_, i) => 1 + (((i + 2) * (seed + 5) * 7919) % 7) / 7);

/** A total spread over a rhythm, summing to the total exactly. */
function spread(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((weight) => Math.round((weight / sum) * total));
  counts[0] += total - counts.reduce((a, b) => a + b, 0);
  return counts.map((count) => Math.max(0, count));
}

/** The same rhythm a week later: a pull request merges after it is opened. */
const lagged = (weights: readonly number[]): number[] => [weights[0], ...weights.slice(0, -1)];

/** The stage flow, shaped like a real repository: fast in the middle, long tails. */
const STAGES: Array<Omit<StageSummary, "weekly"> & { weekly: number[] }> = [
  {
    key: "triage",
    label: "Triage",
    measures: "opened, until it reaches a milestone or project",
    source: "issue",
    left: 96,
    waiting: 37,
    median: 1.8,
    p75: 6,
    p90: 14,
    weekly: [2.9, 2.4, 2.6, 1.9, 1.7, 1.8],
  },
  {
    key: "ownership",
    label: "Assign ownership",
    measures: "in a milestone or project, until someone is assigned",
    source: "issue",
    left: 74,
    waiting: 112,
    median: 9.4,
    p75: 24,
    p90: 46,
    weekly: [6.1, 7, 8.2, 8.8, 9.1, 9.4],
  },
  {
    key: "implement",
    source: "pullRequest",
    label: "Implement change",
    measures: "opened as a draft, until marked ready for review",
    left: 71,
    waiting: 6,
    median: 0.9,
    p75: 2.4,
    p90: 5.1,
    weekly: [1.4, 1.2, 1.1, 1, 0.8, 0.9],
  },
  {
    key: "prepare",
    source: "pullRequest",
    label: "Prepare pull request",
    measures: "ready for review, until a reviewer is asked",
    left: 118,
    waiting: 2,
    median: 0.08,
    p75: 0.5,
    p90: 1.6,
    weekly: [0.2, 0.1, 0.1, 0.2, 0.1, 0.08],
  },
  {
    key: "review",
    source: "pullRequest",
    label: "Code review",
    measures: "a reviewer asked, until they leave a review",
    left: 548,
    waiting: 14,
    median: 0.35,
    p75: 0.95,
    p90: 2.8,
    weekly: [0.7, 0.9, 0.9, 0.3, 0.1, 0.4],
  },
  {
    key: "decision",
    source: "pullRequest",
    label: "Merge decision",
    measures: "approved, until merged",
    left: 62,
    waiting: 3,
    median: 0.3,
    p75: 0.8,
    p90: 2,
    weekly: [0.5, 0.4, 0.3, 0.3, 0.2, 0.3],
  },
];

function fixture(period: PeriodId, sync: SyncStatus = SYNCED): PeopleActivityResult {
  const buckets = bucketsFor(period, NOW);
  // A longer period holds more of everything, so the totals scale with it.
  const scale = period === "6w" ? 1 : period === "12w" ? 2 : period === "6m" ? 4.3 : 8.7;
  const totals = PEOPLE.map((person, p) => ({
    ...person,
    opened: Math.round(person.opened * scale),
    merged: Math.round(person.merged * scale),
    requested: Math.round(person.requested * scale),
    given: Math.round(person.given * scale),
    seed: p,
  }));
  const people = totals.map(({ login, requested, given, seed }) => {
    const weights = rhythm(seed, buckets.length);
    return {
      login,
      requested: spread(requested, weights),
      given: spread(given, lagged(weights)),
      requestedTotal: requested,
      givenTotal: given,
    };
  });
  const authors = totals.map(({ login, opened, merged, seed }) => {
    const weights = rhythm(seed + 1, buckets.length);
    return {
      login,
      opened: spread(opened, weights),
      merged: spread(merged, lagged(weights)),
      openedTotal: opened,
      mergedTotal: merged,
    };
  });
  return {
    repository: "acme/widgets",
    buckets,
    stages: STAGES.map((stage) => ({ ...stage, weekly: stage.weekly.slice(0, buckets.length) })),
    authors,
    people,
    sync,
  };
}

function Page({ initial = "6w", sync, initialHovered }: { initial?: PeriodId; sync?: SyncStatus; initialHovered?: number }) {
  const [period, setPeriod] = useState<PeriodId>(initial);
  return (
    <DashboardView
      period={period}
      onPeriod={setPeriod}
      data={fixture(period, sync)}
      error={null}
      onOpenPerson={() => undefined}
      onOpenStage={() => undefined}
      now={NOW}
      initialHovered={initialHovered}
    />
  );
}

/** Six weeks, the default: a chart per person in each section, busiest first, and the quiet tail folded into rows of counts. */
export const SixWeeks = () => <Page />;

/** Hovering a week shows that week's counts for the person hovered. */
export const SixWeeksHovered = () => <Page initialHovered={3} />;

/** A year, drawn by month. */
export const OneYear = () => <Page initial="1y" />;

/** The first sync, still reaching back two years; the charts fill in as pages arrive. */
export const FirstSync = () => (
  <Page sync={{ syncedAt: null, running: true, backfillDone: false, pullRequests: 350, issues: 0, error: null }} />
);

/** Before a repository is set. */
export const NoRepository = () => (
  <DashboardView
    period="6w"
    onPeriod={() => undefined}
    data={{ repository: null, buckets: [], stages: [], authors: [], people: [], sync: { ...SYNCED, syncedAt: null, pullRequests: 0, issues: 0 } }}
    error={null}
    onOpenPerson={() => undefined}
    onOpenStage={() => undefined}
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

const WAITING_NOW = [
  {
    number: 1796,
    title: "Rebuild the gadget importer so a partial upload can be resumed from the last good row",
    url: "https://github.com/acme/widgets/pull/1796",
    author: "mona",
    startedAt: "2026-09-02T09:00:00Z",
    endedAt: null,
    days: 23.4,
  },
  {
    number: 1812,
    title: "Keep the widget picker open while a gadget loads",
    url: "https://github.com/acme/widgets/pull/1812",
    author: "octocat",
    startedAt: "2026-09-17T09:00:00Z",
    endedAt: null,
    days: 10.8,
  },
  {
    number: 1829,
    title: "Retry gadget sync once before reporting failure",
    url: "https://github.com/acme/widgets/pull/1829",
    author: "hubber",
    startedAt: "2026-09-30T09:00:00Z",
    endedAt: null,
    days: 5.6,
  },
  {
    number: 1835,
    title: "Drop the unused widgets index",
    url: "https://github.com/acme/widgets/pull/1835",
    author: "monalisa",
    startedAt: "2026-10-02T09:00:00Z",
    endedAt: null,
    days: 4.1,
  },
  {
    number: 1841,
    title: "Name both totals on a gadget card",
    url: "https://github.com/acme/widgets/pull/1841",
    author: "spacecat",
    startedAt: "2026-10-05T09:00:00Z",
    endedAt: null,
    days: 2.9,
  },
];

function stageFixture(overrides: Partial<StageDetailResult["stage"]> = {}): StageDetailResult {
  const buckets = bucketsFor("6w", NOW);
  const counts = [34, 92, 51, 84, 97, 128];
  const medians = [0.7, 0.9, 0.9, 0.3, 0.1, 0.4];
  const p90s = [2.8, 4.4, 3.1, 1.8, 1.7, 2.3];
  return {
    repository: "acme/widgets",
    buckets,
    stage: {
      // The Code review row from the dashboard, with the detail its page adds.
      ...STAGES.find((stage) => stage.key === "review")!,
      waiting: WAITING_NOW.length + 9,
      weekly: medians,
      spread: [
        { label: "under 6h", count: 262 },
        { label: "6h–1d", count: 168 },
        { label: "1–2d", count: 46 },
        { label: "2–3d", count: 28 },
        { label: "3–5d", count: 41 },
        { label: "over 5d", count: 6 },
      ],
      queue: [
        { label: "under 1d", count: 5, late: false },
        { label: "1–3d", count: 5, late: false },
        { label: "3–7d", count: 2, late: true },
        { label: "over 7d", count: 2, late: true },
      ],
      series: buckets.map((bucket, index) => ({
        label: bucket.label,
        count: counts[index],
        median: medians[index],
        p90: p90s[index],
      })),
      waitingNow: WAITING_NOW,
      ...overrides,
    },
    waitingPaging: { page: 0, pages: 3, from: 1, to: 5, total: 14 },
    sync: SYNCED,
  };
}

function Stage({ data = stageFixture() }: { data?: StageDetailResult }) {
  const [period, setPeriod] = useState<PeriodId>("6w");
  return (
    <StageView
      period={period}
      onPeriod={setPeriod}
      data={data}
      error={null}
      onBack={() => undefined}
      onWaitingPage={() => undefined}
      periodLabel={PERIOD_LENGTHS[period]}
      now={NOW}
    />
  );
}

/** One stage's page: how long it took, how long the queue has waited, what is in it, and each week. */
export const StagePage = () => <Stage />;

/** A stage with nothing waiting: the queue chart is empty and the list says so. */
export const StagePageClear = () => (
  <Stage
    data={{
      ...stageFixture({
        waiting: 0,
        queue: [
          { label: "under 1d", count: 0, late: false },
          { label: "1–3d", count: 0, late: false },
          { label: "3–7d", count: 0, late: true },
          { label: "over 7d", count: 0, late: true },
        ],
        waitingNow: [],
      }),
      waitingPaging: { page: 0, pages: 1, from: 0, to: 0, total: 0 },
    }}
  />
);

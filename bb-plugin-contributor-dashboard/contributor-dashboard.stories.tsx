import { useState } from "react";

import { DashboardView } from "./components/dashboard-view";
import { PersonView } from "./components/person-view";
import { StageView } from "./components/stage-view";
import type { FlowCounts, MinorRelease, OlderReleases, PeopleActivityResult, Releases, BucketFlows, StageDetailResult, StageSummary, SyncStatus } from "./dashboard/contract";
import { PAGE_SIZE, pageOf } from "./dashboard/paging";
import { bucketsFor, rangeOf, selectionWords, type PresetId, type Selection } from "./dashboard/period";

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
  Array.from(
    { length: buckets },
    (_, i) => 1 + 0.45 * Math.sin((i + seed) / 1.7) + 0.2 * Math.sin((i * 2 + seed) / 1.1),
  );

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

/**
 * Six weeks of where everything opened went, shaped like a real repository:
 * most pull requests have a reviewer asked and a handful skip review, while a
 * seventh of issues are assigned without ever reaching a plan.
 */
const FLOW: FlowCounts = {
  issues: {
    opened: 141,
    planned: 83,
    assignedFromPlan: 60,
    assignedWithoutPlan: 19,
    closedAssigned: 47,
    closedPlanned: 0,
    closedUntriaged: 5,
  },
  pullRequests: {
    opened: 419,
    drafted: 172,
    asked: 347,
    reviewedUnasked: 20,
    changesRequested: 46,
    approved: 312,
    merged: 309,
    mergedUnreviewed: 10,
    closed: 36,
  },
};

/** Every count in the flow multiplied by the same factor, for a longer or shorter span. */
function scaledFlow(factor: number): FlowCounts {
  const scale = <T extends Record<string, number>>(counts: T): T =>
    Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Math.round(value * factor)])) as T;
  return { issues: scale(FLOW.issues), pullRequests: scale(FLOW.pullRequests) };
}

/** What a release's notes might list, in rotation: sizes and mixes like a real repository's. */
const RELEASE_MIXES: Array<MinorRelease["kinds"]> = [
  { feat: 7, fix: 6, refactor: 5, chore: 6, deps: 13, none: 4 },
  { feat: 4, fix: 6, refactor: 4, chore: 3, deps: 8, none: 3 },
  { feat: 9, fix: 12, refactor: 10, chore: 8, deps: 18, none: 6 },
  { feat: 11, fix: 14, refactor: 12, chore: 13, deps: 19, none: 8 },
  { feat: 6, fix: 9, refactor: 11, chore: 8, deps: 14, none: 4 },
  { feat: 14, fix: 22, refactor: 21, chore: 17, deps: 41, none: 13 },
];

/** Each person's share of a release's merges and reviews. */
const RELEASE_SHARES: Array<[string, number, number]> = [
  ["octocat", 0.27, 0.14],
  ["hubber", 0.18, 0.43],
  ["mona", 0.15, 0.16],
  ["monalisa", 0.12, 0.11],
  ["spacecat", 0.1, 0.06],
  ["webcat", 0.07, 0.05],
  ["yeti", 0.05, 0.03],
  ["dinotocat", 0.04, 0.02],
  ["wavetocat", 0.02, 0],
];

const sumOf = (kinds: MinorRelease["kinds"]) => Object.values(kinds).reduce((a, b) => a + b, 0);

function releaseOf(tag: string, publishedAt: number, kinds: MinorRelease["kinds"], seed: number) {
  const humans = sumOf(kinds) - kinds.deps;
  return {
    tag,
    url: `https://github.com/acme/widgets/releases/tag/${tag}`,
    publishedAt: new Date(publishedAt).toISOString(),
    total: sumOf(kinds),
    kinds,
    people: RELEASE_SHARES.map(([login, merged, reviews], i) => ({
      login,
      merged: Math.max(0, Math.round(humans * merged * (1 + 0.25 * Math.sin(seed + i)))),
      reviews: Math.max(0, Math.round(humans * 1.3 * reviews * (1 + 0.3 * Math.cos(seed * 2 + i)))),
    }))
      .filter((person) => person.merged + person.reviews > 0)
      .sort((a, b) => b.merged - a.merged || b.reviews - a.reviews),
    bot: kinds.deps,
    missing: 0,
  };
}

const PATCH_KINDS = { feat: 0, fix: 0, refactor: 0, chore: 0, deps: 0, none: 0 };

const DAY = 86_400_000;

const NO_FLOWS: BucketFlows = { started: [], finished: [], flows: [], fromEarlier: [], open: [], asked: null, median: 0, p90: 0 };

/** The Wednesday the fixture numbers its minors from: v2.30.0. A minor before it has a lower number. */
const FIRST_MINOR = new Date(2026, 8, 2, 15).getTime();

/** The first release afternoon, a Wednesday, at or after `from`. */
function wednesdayFrom(from: number): number {
  const first = new Date(from);
  first.setDate(first.getDate() + ((3 - first.getDay() + 7) % 7));
  first.setHours(15, 0, 0, 0);
  return first.getTime();
}

/** One Wednesday's minor, numbered by its week, with a patch every third week. */
function minorAt(at: number, to: number): MinorRelease {
  const week = Math.round((at - FIRST_MINOR) / (7 * DAY));
  const index = ((week % 6) + 6) % 6;
  const minor = releaseOf(`v2.${30 + week}.0`, at, RELEASE_MIXES[index], week);
  const patches =
    week % 3 === 0 && at + DAY < to
      ? [
          {
            ...releaseOf(`v2.${30 + week}.1`, at + DAY, { ...PATCH_KINDS, fix: 2 }, week + 9),
            firstLine: "fix(export): keep gadget names when exporting",
          },
        ]
      : [];
  return { ...minor, patches };
}

/** The fixture repository's first minor: See more stops here. */
const OLDEST_MINOR = FIRST_MINOR - 20 * 7 * DAY;

/**
 * A minor every Wednesday of the span, newest first. Every third has a
 * patch the next day, and the newest has two, the second of them a revert.
 */
function releasesFor(from: number, to: number): Releases {
  const minors: MinorRelease[] = [];
  for (let at = wednesdayFrom(from); at < to; at += 7 * DAY) minors.push(minorAt(at, to));
  const newest = minors.at(-1);
  if (newest !== undefined && Date.parse(newest.publishedAt) + 1.5 * DAY < to) {
    const at = Date.parse(newest.publishedAt);
    const series = newest.tag.replace(/\.0$/, "");
    newest.patches = [
      { ...releaseOf(`${series}.1`, at + 0.8 * DAY, { ...PATCH_KINDS, fix: 3, feat: 1 }, 20), firstLine: "fix(search): match sprockets by name" },
      { ...releaseOf(`${series}.2`, at + 1.3 * DAY, { ...PATCH_KINDS, fix: 1 }, 21), firstLine: "revert: sprocket search ranking, which backs out #1890" },
    ];
  }
  minors.reverse();
  const patches = minors.reduce((sum, minor) => sum + minor.patches.length, 0);
  const older = Math.max(0, Math.round((wednesdayFrom(from) - OLDEST_MINOR) / (7 * DAY)));
  return { published: minors.length + patches, patches, minors, older };
}

/** See more, as the server answers it: the `count` minors before `before`. */
async function olderReleasesFor(before: number, count: number): Promise<OlderReleases> {
  const minors: MinorRelease[] = [];
  let at = wednesdayFrom(before) - 7 * DAY;
  for (; minors.length < count && at >= OLDEST_MINOR; at -= 7 * DAY) minors.push(minorAt(at, before));
  return { minors, more: at >= OLDEST_MINOR };
}

/**
 * A velocity chart's flows, built from the same per-bucket totals the cards
 * draw so the two agree: each bucket's finishes come mostly from that bucket's
 * arrivals, some from the one before, a few from two before, and the rest from
 * before the period. What is left unfinished piles onto a steady backlog.
 */
function flowsFor(started: number[], finished: number[], backlog: number, askedShare: number | null, median: number, p90: number): BucketFlows {
  const n = started.length;
  const flows = started.map(() => started.map(() => 0));
  const left = [...started];
  const fromEarlier = finished.map(() => 0);
  finished.forEach((total, j) => {
    let need = total;
    for (const [back, share] of [[1, 0.25], [0, 0.85], [2, 1]] as const) {
      const i = j - back;
      if (i < 0 || need === 0) continue;
      const take = Math.min(need, left[i], Math.round(left[i] * share));
      flows[i][j] += take;
      left[i] -= take;
      need -= take;
    }
    fromEarlier[j] = need;
  });
  const open: number[] = [];
  let carried = backlog;
  for (let i = 0; i < n; i += 1) {
    carried += started[i] - finished[i];
    open.push(Math.max(0, carried));
  }
  return {
    started,
    finished,
    flows,
    fromEarlier,
    open,
    asked: askedShare === null ? null : open.map((count) => Math.round(count * askedShare)),
    median,
    p90,
  };
}

const bucketSums = (rows: Array<{ [key: string]: unknown }>, key: string, n: number) =>
  Array.from({ length: n }, (_, i) => rows.reduce((sum, row) => sum + ((row[key] as number[])[i] ?? 0), 0));

function fixture(selection: Selection, sync: SyncStatus = SYNCED): PeopleActivityResult {
  const buckets = bucketsFor(rangeOf(selection, NOW));
  // A longer span holds more of everything, so the totals scale with it.
  const scale: Record<PresetId, number> = { "2w": 1 / 3, "6w": 1, "3m": 2.2 };
  const factor = scale[selection.kind === "preset" ? selection.id : "6w"];
  const totals = PEOPLE.map((person, p) => ({
    ...person,
    opened: Math.round(person.opened * scale[selection.kind === "preset" ? selection.id : "6w"]),
    merged: Math.round(person.merged * scale[selection.kind === "preset" ? selection.id : "6w"]),
    requested: Math.round(person.requested * scale[selection.kind === "preset" ? selection.id : "6w"]),
    given: Math.round(person.given * scale[selection.kind === "preset" ? selection.id : "6w"]),
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
    stages: STAGES.map((stage) => ({
      ...stage,
      weekly: buckets.map((_, index) => stage.weekly[index % stage.weekly.length]),
    })),
    flow: scaledFlow(factor),
    releases: releasesFor(buckets[0].start, Math.min(buckets.at(-1)!.end, NOW)),
    velocity: {
      merge: flowsFor(bucketSums(authors, "opened", buckets.length), bucketSums(authors, "merged", buckets.length), 90, 0.6, 0.92, 4.9),
      review: flowsFor(bucketSums(people, "requested", buckets.length), bucketSums(people, "given", buckets.length), 40, null, 0.3, 2.9),
    },
    authors,
    people,
    sync,
  };
}

function Page({
  initial = { kind: "preset", id: "6w" },
  sync,
  initialHovered,
}: {
  initial?: Selection;
  sync?: SyncStatus;
  initialHovered?: number;
}) {
  const [selection, setSelection] = useState<Selection>(initial);
  return (
    <DashboardView
      selection={selection}
      onSelect={setSelection}
      data={fixture(selection, sync)}
      error={null}
      onOpenPerson={() => undefined}
      onOpenStage={() => undefined}
      onLoadOlderReleases={olderReleasesFor}
      now={NOW}
      initialHovered={initialHovered}
    />
  );
}

/** Six weeks, the default: a chart per person in each section, busiest first, and the quiet tail folded into rows of counts. */
export const SixWeeks = () => <Page />;

/** Hovering a week shows that week's counts for the person hovered. */
export const SixWeeksHovered = () => <Page initialHovered={3} />;

/** Three months, the longest preset, drawn by week. */
export const ThreeMonths = () => <Page initial={{ kind: "preset", id: "3m" }} />;

/** Two weeks, drawn by day: the shortest preset. */
export const TwoWeeks = () => <Page initial={{ kind: "preset", id: "2w" }} />;

/** A range someone picked, which no preset covers: a quarter drawn by week, with the dates on the button. */
export const CustomRange = () => (
  <Page initial={{ kind: "custom", from: new Date(2026, 5, 1).getTime(), to: new Date(2026, 8, 1).getTime() }} />
);

/** The first sync, still reaching back two years; the charts fill in as pages arrive. */
export const FirstSync = () => (
  <Page sync={{ syncedAt: null, running: true, backfillDone: false, pullRequests: 350, issues: 0, error: null }} />
);

/** Before a repository is set. */
export const NoRepository = () => (
  <DashboardView
    selection={{ kind: "preset", id: "6w" }}
    onSelect={() => undefined}
    data={{ repository: null, buckets: [], stages: [], flow: scaledFlow(0), releases: { published: 0, patches: 0, minors: [], older: 0 }, velocity: { merge: NO_FLOWS, review: NO_FLOWS }, authors: [], people: [], sync: { ...SYNCED, syncedAt: null, pullRequests: 0, issues: 0 } }}
    error={null}
    onOpenPerson={() => undefined}
    onOpenStage={() => undefined}
    onLoadOlderReleases={olderReleasesFor}
    now={NOW}
  />
);

/** A sync that failed, such as gh not being signed in. */
export const SyncFailed = () => (
  <Page sync={{ ...SYNCED, error: "`gh` is not authenticated. Run `gh auth login`." }} />
);

const AWAITING = [
  { number: 1840, title: "Add retry to widget sync", url: "https://github.com/acme/widgets/pull/1840", author: "mona", assignees: ["hubber"], threadId: "thr_demo", requestedAt: "2026-10-02T09:00:00Z", waitingDays: 3.2 },
  { number: 1831, title: "Rename sprocket fields", url: "https://github.com/acme/widgets/pull/1831", author: "webcat", assignees: [], threadId: null, requestedAt: "2026-10-05T14:00:00Z", waitingDays: 1.9 },
  { number: 1828, title: "Cache avatar lookups", url: "https://github.com/acme/widgets/pull/1828", author: "yeti", assignees: [], threadId: null, requestedAt: "2026-10-06T10:00:00Z", waitingDays: 0.8 },
];

const AUTHORED = [
  { number: 1837, title: "Paginate gadget search", url: "https://github.com/acme/widgets/pull/1837", threadId: "thr_demo", state: "OPEN" as const, isDraft: false, createdAt: "2026-10-05T09:00:00Z", firstReviewDays: 0.6, followUps: 1, mergeDays: null, waitingDays: 2.1 },
  { number: 1822, title: "Validate webhook payloads", url: "https://github.com/acme/widgets/pull/1822", threadId: null, state: "MERGED" as const, isDraft: false, createdAt: "2026-09-29T09:00:00Z", firstReviewDays: 1.4, followUps: 2, mergeDays: 3.7, waitingDays: null },
  { number: 1816, title: "Upgrade chart library", url: "https://github.com/acme/widgets/pull/1816", threadId: null, state: "MERGED" as const, isDraft: false, createdAt: "2026-09-24T09:00:00Z", firstReviewDays: 0.3, followUps: 0, mergeDays: 1.1, waitingDays: null },
  { number: 1807, title: "Show empty state on list", url: "https://github.com/acme/widgets/pull/1807", threadId: null, state: "OPEN" as const, isDraft: true, createdAt: "2026-09-21T09:00:00Z", firstReviewDays: null, followUps: 0, mergeDays: null, waitingDays: null },
  { number: 1801, title: "Remove unused flags", url: "https://github.com/acme/widgets/pull/1801", threadId: null, state: "CLOSED" as const, isDraft: false, createdAt: "2026-09-18T09:00:00Z", firstReviewDays: 2.2, followUps: 1, mergeDays: null, waitingDays: null },
];

/** Enough pull requests to page through, by repeating the five above. */
function manyAuthored(total: number) {
  return Array.from({ length: total }, (_, index) => ({
    ...AUTHORED[index % AUTHORED.length],
    number: 1837 - index * 3,
  }));
}

function Person({
  initial = { kind: "preset", id: "6w" },
  awaiting = AWAITING,
  authored = AUTHORED,
  login = "octocat",
}: {
  initial?: Selection;
  awaiting?: typeof AWAITING;
  authored?: typeof AUTHORED;
  login?: string;
}) {
  const [selection, setSelection] = useState<Selection>(initial);
  const [authoredPage, setAuthoredPage] = useState(0);
  const page = fixture(selection);
  const paging = pageOf(authored.length, authoredPage);
  return (
    <PersonView
      login={login}
      selection={selection}
      onSelect={setSelection}
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
      onThread={() => undefined}
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
    assignees: [],
    threadId: null,
    startedAt: "2026-09-02T09:00:00Z",
    endedAt: null,
    days: 23.4,
  },
  {
    number: 1812,
    title: "Keep the widget picker open while a gadget loads",
    url: "https://github.com/acme/widgets/pull/1812",
    author: "octocat",
    assignees: ["hubber"],
    threadId: "thr_demo",
    startedAt: "2026-09-17T09:00:00Z",
    endedAt: null,
    days: 10.8,
  },
  {
    number: 1829,
    title: "Retry gadget sync once before reporting failure",
    url: "https://github.com/acme/widgets/pull/1829",
    author: "hubber",
    assignees: ["mona", "spacecat"],
    threadId: null,
    startedAt: "2026-09-30T09:00:00Z",
    endedAt: null,
    days: 5.6,
  },
  {
    number: 1835,
    title: "Drop the unused widgets index",
    url: "https://github.com/acme/widgets/pull/1835",
    author: "monalisa",
    assignees: [],
    threadId: null,
    startedAt: "2026-10-02T09:00:00Z",
    endedAt: null,
    days: 4.1,
  },
  {
    number: 1841,
    title: "Name both totals on a gadget card",
    url: "https://github.com/acme/widgets/pull/1841",
    author: "spacecat",
    assignees: [],
    threadId: null,
    startedAt: "2026-10-05T09:00:00Z",
    endedAt: null,
    days: 2.9,
  },
];

function stageFixture(overrides: Partial<StageDetailResult["stage"]> = {}): StageDetailResult {
  const buckets = bucketsFor(rangeOf({ kind: "preset", id: "6w" }, NOW));
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
  const [selection, setSelection] = useState<Selection>({ kind: "preset", id: "6w" });
  return (
    <StageView
      selection={selection}
      onSelect={setSelection}
      data={data}
      error={null}
      onBack={() => undefined}
      onWaitingPage={() => undefined}
      onThread={() => undefined}
      periodLabel={selectionWords(selection)}
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

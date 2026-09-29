import type { ReactNode } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import type { HarvestTimerClient } from "bb-plugin-harvest/picker";
import { Icon } from "./components/ui/icon";
import { SyncStatus } from "./components/ui/sync-status";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  ReviewListView,
  type HarvestPanelState,
  type Listing,
  type Row,
} from "./review/list-view";

export default {
  title: "review-sweep/Review list",
};

/** The real clock, so the synced-ago label in the title bar agrees with the ages. */
const now = Date.now();
const HOUR = 3_600_000;
const noop = () => {};

function row(overrides: Partial<Row> & Pick<Row, "number" | "title">): Row {
  return {
    repo: "acme/widgets",
    url: `https://github.com/${overrides.repo ?? "acme/widgets"}/pull/${overrides.number}`,
    author: "octocat",
    isDraft: false,
    state: "first-look",
    requestedAt: now - 5 * HOUR,
    lastReviewedAt: null,
    requestedReviewers: ["you"],
    size: { additions: 40, deletions: 6, changedFiles: 3 },
    canSpawn: true,
    threadId: null,
    snoozedUntil: null,
    comments: 0,
    note: null,
    newComments: 0,
    ...overrides,
  };
}

const needsReview: Row[] = [
  row({
    number: 412,
    title: "test(widgets): cover the widget export for every account type",
    requestedAt: now - 60 * HOUR,
    requestedReviewers: ["widgets-api-experts"],
    size: { additions: 15208, deletions: 64, changedFiles: 71 },
  }),
  row({
    number: 437,
    title: "fix(gadgets): keep the `sort` order when a gadget is renamed",
    requestedAt: now - 9 * HOUR,
    requestedReviewers: ["widgets-committers"],
    size: { additions: 18, deletions: 4, changedFiles: 2 },
    comments: 3,
    newComments: 2,
  }),
];

const inProgress: Row[] = [
  row({
    number: 425,
    title:
      "docs: propose moving widget themes into their own package so each gadget can override them",
    requestedAt: now - 17 * HOUR,
    size: { additions: 96, deletions: 0, changedFiles: 1 },
    threadId: "thr_fixture1",
    note: "Check the theme override example against the gadget docs",
  }),
];

/** A typical day, with invented names. */
const baseline: Listing = {
  rows: [...needsReview, ...inProgress],
  sweptAt: now - 2 * 60_000,
  skippedRepos: [],
  truncated: false,
  lastError: null,
  staleAfterDays: 2,
  harvest: { available: true, running: null },
};

/** Every run and every row state at once. */
const everything: Listing = {
  ...baseline,
  rows: [
    ...needsReview,
    row({
      number: 398,
      title: "Retry widget uploads that time out",
      author: "hubber",
      state: "re-review",
      requestedAt: now - 5 * 24 * HOUR,
      lastReviewedAt: now - 6 * 24 * HOUR,
      requestedReviewers: ["you", "hubber", "widgets-committers", "widgets-api-experts"],
      size: { additions: 320, deletions: 118, changedFiles: 14 },
    }),
    row({
      number: 441,
      title: "Bump the gadget SDK",
      author: "hubber",
      requestedAt: now - 20 * 60_000,
      requestedReviewers: [],
      size: { additions: 2, deletions: 2, changedFiles: 1 },
      canSpawn: false,
    }),
    ...inProgress,
    row({
      number: 405,
      title: "Rename widget slots to match the design doc",
      state: "re-review",
      requestedAt: now - 3 * 24 * HOUR,
      threadId: "thr_fixture2",
    }),
    row({
      number: 443,
      title: "WIP: widget search",
      isDraft: true,
      requestedAt: now - 26 * HOUR,
      size: { additions: 890, deletions: 45, changedFiles: 21 },
    }),
    row({
      number: 390,
      title: "Move the gadget cache to a worker",
      requestedAt: now - 4 * 24 * HOUR,
      snoozedUntil: now + 30 * HOUR,
    }),
  ],
};

const multiRepo: Listing = {
  ...everything,
  rows: everything.rows.map((r, index) =>
    index % 2 ? { ...r, repo: "acme/gadgets", url: r.url.replace("widgets", "gadgets") } : r,
  ),
};

const harvestClient: HarvestTimerClient = {
  assignments: async () => ({ projects: [] }),
  trackedHours: async () => ({ hours: 0 }),
  startTimer: async () => ({ entry: null }),
  lastSelection: async () => null,
  stopTimer: async () => {},
};

function harvestFor(listing: Listing): HarvestPanelState {
  return {
    available: listing.harvest.available,
    running: listing.harvest.running,
    client: harvestClient,
    onStarted: noop,
  };
}

/** The panel's title bar, so a frame reads like the real panel. */
function Frame({
  listing,
  starting = new Set(),
  height,
}: {
  listing: Listing | null;
  starting?: Set<string>;
  /** Fixed for the loading and empty states; otherwise the frame fits its rows. */
  height?: string;
}): ReactNode {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={`flex w-full flex-col rounded-lg border border-border bg-background ${height ?? ""}`}>
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Icon name="Eye" className="size-4 text-muted-foreground" />
            Reviews
          </span>
          <SyncStatus sweptAt={listing?.sweptAt ?? null} busy={false} onRefresh={noop} />
        </div>
        <div className="min-h-0 flex-1">
          <ReviewListView
            listing={listing}
            now={now}
            starting={starting}
            harvest={listing ? harvestFor(listing) : harvestFor(baseline)}
            onReview={noop}
            onOpen={noop}
            onArchive={noop}
            onSnooze={noop}
            onUnsnooze={noop}
            onNoteSave={async () => true}
            onOpenLink={noop}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * A typical day. The one waited on too long and the one with a thread are open
 * at the top; the fresh request, with two new comments, is closed to its
 * number line.
 */
export function Baseline() {
  return (
    <StoryCard>
      <StoryRow
        label="Baseline"
        hint="One waiting too long, one with a thread and a note, and a fresh one with two new comments."
      >
        <Frame listing={baseline} />
      </StoryRow>
    </StoryCard>
  );
}

/**
 * Every run the list can draw: re-review, waiting too long, and reviewing in
 * Now; to review in Next; drafts and ignored in Later. Then the list across
 * two repositories, a thread being started with a timer running, and the
 * panel without Harvest.
 */
export function Rows() {
  return (
    <StoryCard>
      <StoryRow
        label="Every run"
        hint="Two re-reviews, one with a thread; one waiting too long; one reviewing with a note; two to review, one with no reviewers and no project checked out; a draft; and an ignored review."
      >
        <Frame listing={everything} />
      </StoryRow>
      <StoryRow label="Two repositories" hint="The repository joins the number line once it varies.">
        <Frame listing={multiRepo} />
      </StoryRow>
      <StoryRow
        label="Starting and timing"
        hint="A thread being created on #412, and a Harvest timer running on #425."
      >
        <Frame
          listing={{
            ...baseline,
            harvest: {
              available: true,
              running: {
                externalId: "425",
                groupId: null,
                entryId: 1,
                startedAt: new Date(now - 25 * 60_000).toISOString(),
                projectName: "Widgets",
                taskName: "Code Review",
              },
            },
          }}
          starting={new Set(["acme/widgets#412"])}
        />
      </StoryRow>
      <StoryRow label="Without Harvest" hint="No clock in the action line.">
        <Frame listing={{ ...baseline, harvest: { available: false, running: null } }} />
      </StoryRow>
    </StoryCard>
  );
}

/** Loading, empty, and the notices the panel shows above and below its rows. */
export function States() {
  const empty: Listing = { ...baseline, rows: [] };
  return (
    <StoryCard>
      <StoryRow label="Loading" hint="The first load, before the listing arrives.">
        <Frame listing={null} height="h-[26rem]" />
      </StoryRow>
      <StoryRow label="Empty" hint="Nothing waiting on you.">
        <Frame listing={empty} height="h-[26rem]" />
      </StoryRow>
      <StoryRow label="Empty, repositories hidden" hint="Requests exist in repositories with no project here.">
        <Frame listing={{ ...empty, skippedRepos: ["acme/gadgets"] }} height="h-[26rem]" />
      </StoryRow>
      <StoryRow label="Warnings" hint="A failed sweep, the search ceiling, and a hidden repository.">
        <Frame
          listing={{
            ...baseline,
            lastError: "gh exited 1: HTTP 502 from api.github.com",
            truncated: true,
            skippedRepos: ["acme/gadgets"],
          }}
        />
      </StoryRow>
    </StoryCard>
  );
}

const LONG_TITLES = [
  "WIP: widget bulk edit",
  "Draft: gadget webhooks v2",
  "Try a card layout for widgets",
  "Spike: gadget offline mode",
  "WIP: widget import from CSV",
  "Draft: split the gadget API client",
  "Explore widget tagging",
  "WIP: gadget usage charts",
];

/** Many draft requests, so the fold after five Later rows shows. */
const long: Listing = {
  ...baseline,
  rows: [
    ...baseline.rows,
    ...LONG_TITLES.map((title, index) =>
      row({
        number: 450 + index,
        title,
        isDraft: true,
        author: index % 2 ? "hubber" : "octocat",
        requestedAt: now - (index + 1) * 11 * HOUR,
      }),
    ),
  ],
};

/**
 * A long list: the Now and Next rows at the top, then the first five Later
 * rows, with the rest folded into "N more".
 */
export function LongList() {
  return (
    <StoryCard>
      <StoryRow label="Long list" hint="Eight draft requests, three of them folded.">
        <Frame listing={long} />
      </StoryRow>
    </StoryCard>
  );
}

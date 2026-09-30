import type { ReactNode } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import type { HarvestTimerClient } from "bb-plugin-harvest/picker";
import { Icon } from "./components/ui/icon";
import { SyncStatus } from "./components/ui/sync-status";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  PrListView,
  type HarvestPanelState,
  type Listing,
  type Row,
} from "./sweep/list-view";

export default {
  title: "pr-sweep/PR list",
};

/** The real clock, so the synced-ago label in the title bar agrees with the ages. */
const now = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const noop = () => {};

const GREEN = { pass: 8, fail: 0, skip: 1, pending: 0, cancelled: 0, total: 9 };

/** A drawn picture for each account, so the stories need no network. */
function avatar(letter: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="${color}"/><text x="10" y="14" font-family="sans-serif" font-size="11" font-weight="600" fill="white" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const AVATARS: Record<string, string> = {
  hubber: avatar("H", "#d0703c"),
  octocat: avatar("O", "#7c5cc4"),
  acme: avatar("A", "#4a6b8a"),
};
const avatarFor = (owner: string) => AVATARS[owner] ?? avatar(owner[0]!.toUpperCase(), "#6e7781");

function checks(overrides: Partial<Row["checks"]>): Row["checks"] {
  const merged = { pass: 0, fail: 0, skip: 0, pending: 0, cancelled: 0, ...overrides };
  return {
    ...merged,
    total: merged.pass + merged.fail + merged.skip + merged.pending + merged.cancelled,
  };
}

// Each fixture matches what sweep/classify.ts would produce for some real pull
// request shape: the flags, the group, and the review fields agree with each
// other, so every row lands in the run the live panel would put it in.
function row(overrides: Partial<Row> & Pick<Row, "number" | "title">): Row {
  const repo = overrides.repo ?? "acme/widgets";
  const flags = overrides.flags ?? [];
  return {
    repo,
    url: `https://github.com/${repo}/pull/${overrides.number}`,
    isDraft: false,
    flags,
    group: flags.includes("merge-ready")
      ? "ready-to-merge"
      : flags.length > 0
        ? "needs-action"
        : "clean",
    checks: GREEN,
    approvedBy: [],
    commentedBy: [],
    waitingOn: [],
    awaitingReReview: false,
    lastCommentBy: null,
    unresolvedThreads: 0,
    outdatedThreads: 0,
    notedBy: [],
    canSpawn: true,
    threadId: overrides.threadIds?.[0] ?? null,
    threadIds: [],
    updatedAt: now - 5 * HOUR,
    commentsCount: 0,
    note: null,
    newComments: 0,
    additions: 40 + ((overrides.number * 37) % 200),
    deletions: (overrides.number * 13) % 60,
    baseRefName: "main",
    ...overrides,
  };
}

const readyToMerge = row({
  number: 512,
  title: "Cache widget thumbnails between page loads",
  flags: ["merge-ready"],
  approvedBy: ["hubber"],
  // The bottom of a stack, with #495 built on it.
  stack: { index: 1, size: 2, on: null },
});

const conflictAndFeedback = row({
  number: 487,
  title: "Let widgets export to CSV",
  flags: ["conflict", "feedback"],
  checks: checks({ pass: 6, skip: 1 }),
  commentedBy: ["hubber"],
  changesRequestedBy: ["hubber"],
  lastCommentBy: "hubber",
  updatedAt: now - 2 * HOUR,
  commentsCount: 4,
  newComments: 2,
});

const failingCi = row({
  number: 503,
  title: "Retry gadget sync after a network drop",
  flags: ["ci-failing"],
  checks: checks({ fail: 2, pass: 7 }),
  waitingOn: ["hubber"],
});

const inProgress = row({
  number: 495,
  title: "Move widget colours into the theme file",
  flags: ["ci-failing"],
  checks: checks({ fail: 1, pass: 8 }),
  waitingOn: ["hubber"],
  threadIds: ["thr_fixture1"],
  note: "Rerun the theme snapshot job after the rebase",
  stack: { index: 2, size: 2, on: 512 },
});

const awaitingReview = row({
  number: 501,
  title: "Show a gadget's owner on its detail page",
  waitingOn: ["hubber", "acme/api-reviewers"],
  updatedAt: now - DAY,
});

const draft = row({
  number: 522,
  title: "Try a denser layout for the gadget grid",
  isDraft: true,
  checks: checks({ pass: 2 }),
  updatedAt: now - 2 * DAY,
});

/** A few pull requests in the runs they usually sit in. */
const baseline: Listing = {
  rows: [readyToMerge, conflictAndFeedback, failingCi, inProgress, draft, awaitingReview],
  staleAfterDays: 3,
  sweptAt: now - 3 * 60_000,
  failedRepos: [],
  skippedRepos: [],
  truncated: false,
  lastError: null,
  harvest: { available: true, running: null },
};

/** One or more rows in each of today's seven sections, and so in every run. */
const everySection: Listing = {
  ...baseline,
  rows: [
    readyToMerge,
    row({
      number: 509,
      title: "Rename the widget settings page",
      flags: ["merge-ready"],
      approvedBy: ["hubber"],
      unresolvedThreads: 3,
      outdatedThreads: 1,
    }),
    row({
      number: 498,
      title: "Add keyboard shortcuts to the gadget editor",
      flags: ["merge-ready"],
      approvedBy: ["hubber"],
      waitingOn: ["acme/design"],
    }),
    conflictAndFeedback,
    failingCi,
    row({
      number: 506,
      title: "Drop the old gadget importer",
      flags: ["ci-pending"],
      checks: checks({ pass: 4, pending: 3 }),
      approvedBy: ["hubber"],
      unresolvedThreads: 2,
    }),
    inProgress,
    row({
      number: 481,
      title: "Split the widget list into pages of fifty",
      waitingOn: ["hubber"],
      threadIds: ["thr_fixture4", "thr_fixture3", "thr_fixture2"],
    }),
    row({
      number: 515,
      title: "Upgrade the chart library used by the widget dashboard",
      flags: ["ci-pending"],
      checks: checks({ pass: 2, pending: 4 }),
      waitingOn: ["hubber"],
    }),
    awaitingReview,
    row({
      number: 468,
      title: "Explain gadget quotas on the billing page",
      waitingOn: ["octocat"],
      updatedAt: now - 6 * DAY,
    }),
    row({
      number: 470,
      title: "Validate gadget names before saving",
      commentedBy: ["hubber"],
      waitingOn: ["hubber"],
      awaitingReReview: true,
    }),
    row({
      number: 520,
      title: "WIP: widget search",
      isDraft: true,
      flags: ["ci-failing"],
      checks: checks({ fail: 1, pass: 3 }),
    }),
    draft,
  ],
};

/** Every flag the classifier sets, each drawn as the banner shows it. */
const everyStatus: Listing = {
  ...baseline,
  rows: [
    row({
      number: 401,
      title: "Add pagination to the gadget API",
      flags: ["conflict"],
      approvedBy: ["hubber"],
    }),
    row({
      number: 402,
      title: "Speed up widget search on large accounts",
      flags: ["ci-failing"],
      checks: checks({ fail: 3, pass: 5, skip: 2 }),
      waitingOn: ["hubber"],
    }),
    row({
      number: 403,
      title: "Allow widgets to be archived instead of deleted",
      flags: ["feedback"],
      commentedBy: ["hubber"],
      changesRequestedBy: ["hubber"],
      unresolvedThreads: 4,
      outdatedThreads: 2,
    }),
    row({
      number: 415,
      title: "Let admins rename a gadget folder",
      flags: ["feedback"],
      commentedBy: ["octocat", "hubber"],
      approvedBy: ["hubber"],
      waitingOn: ["hubot"],
      unresolvedThreads: 7,
    }),
    row({
      number: 416,
      title: "Cache the gadget list between page loads",
      notedBy: ["octocat"],
      unresolvedThreads: 2,
    }),
    row({
      number: 404,
      title: "Update the gadget import docs",
      flags: ["merge-blocked"],
      approvedBy: ["hubber"],
    }),
    row({
      number: 405,
      title: "Fix the widget count on the home page",
      flags: ["mergeable-unknown"],
      waitingOn: ["hubber"],
    }),
    row({
      number: 406,
      title: "Log gadget sync timings",
      flags: ["ci-cancelled"],
      checks: checks({ cancelled: 1, pass: 6 }),
      waitingOn: ["hubber"],
    }),
    row({
      number: 407,
      title: "Remove unused widget icons",
      flags: ["ci-absent"],
      checks: checks({}),
      waitingOn: ["hubber"],
    }),
    row({
      number: 408,
      title: "Add a dark mode toggle to the widget editor",
      flags: ["no-reviewer"],
    }),
    row({
      number: 409,
      title: "Rewrite the gadget sync queue",
      flags: ["conflict", "ci-failing", "ci-pending"],
      checks: checks({ fail: 1, pending: 2, pass: 4 }),
      waitingOn: ["hubber", "acme/api-reviewers"],
    }),
    row({
      number: 410,
      title: "Store widget preferences per user",
      flags: ["ci-failing"],
      checks: checks({ fail: 1, pass: 4 }),
      waitingOn: ["hubber"],
      canSpawn: false,
    }),
    row({
      number: 411,
      title: "Round gadget prices to two decimals",
      flags: ["merge-ready"],
      approvedBy: ["hubber"],
      commentedBy: ["hubber"],
      lastCommentBy: "hubber",
    }),
    row({
      number: 412,
      title: "Send a weekly widget usage email",
      flags: ["merge-ready"],
      approvedBy: ["hubber", "octocat"],
      notedBy: ["hubber"],
    }),
    row({
      number: 417,
      title: "Batch widget saves into one request",
      flags: ["merge-ready"],
      approvedBy: ["hubber"],
      waitingOn: ["octocat"],
    }),
    row({
      number: 413,
      title: "Show the last sync time on each gadget",
      flags: ["ci-pending"],
      checks: checks({ pass: 3, pending: 5 }),
      waitingOn: ["hubber"],
    }),
    row({
      number: 414,
      title: "Tidy the widget changelog",
      // Stored before the sweep read sizes, so the row shows none.
      additions: undefined,
      deletions: undefined,
    }),
  ],
};

const twoRepos: Listing = {
  ...everySection,
  rows: everySection.rows.map((r, index) =>
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

function harvestFor(listing: Listing | null): HarvestPanelState {
  return {
    available: listing?.harvest.available === true,
    running: listing?.harvest.running ?? null,
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
            <Icon name="GitPullRequest" className="size-4 text-muted-foreground" />
            Pull requests
          </span>
          <SyncStatus sweptAt={listing?.sweptAt ?? null} busy={false} onRefresh={noop} />
        </div>
        <div className="min-h-0 flex-1">
          <PrListView
            listing={listing}
            now={now}
            starting={starting}
            harvest={harvestFor(listing)}
            onWork={noop}
            onOpen={noop}
            onArchive={noop}
            onNoteSave={async () => true}
            onOpenLink={noop}
            avatarFor={avatarFor}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * A typical day. The pull requests that need you, the one ready to merge, and
 * the one with a thread at the top, each with a red banner naming what stops
 * it or a green one when it can merge; then the draft and the one awaiting
 * review. The one with a thread is stacked on the one ready to merge, so each
 * has a chip: "1 of 2 · base" and "2 of 2 · on #512".
 */
export function Baseline() {
  return (
    <StoryCard>
      <StoryRow
        label="Baseline"
        hint="A conflict with two new comments, failing CI, one ready to merge, one with a thread and a note, a draft, and one awaiting review. The one with a thread is stacked on the one ready to merge."
      >
        <Frame listing={baseline} />
      </StoryRow>
    </StoryCard>
  );
}

/**
 * Every run the list can draw: needs you, ready to merge, working, drafts,
 * and waiting, including one stale after six days with its reviewer, pinned
 * on top with the one being worked on, and the rest newest first. Then every flag in the banner, the list
 * across two repositories, a thread being started with a timer running, and
 * the panel without Harvest.
 */
export function Rows() {
  return (
    <StoryCard>
      <StoryRow
        label="Every run"
        hint="Every run, a merge-ready row with open comments, a thread with earlier threads and Archive thread, a stale row awaiting review, a re-review, and drafts with and without a flag."
      >
        <Frame listing={everySection} />
      </StoryRow>
      <StoryRow
        label="Every flag"
        hint="One banner per flag, several flags on one row, No project here where nothing is checked out, a team reviewer, and an unflagged row stored before sizes were read."
      >
        <Frame listing={everyStatus} />
      </StoryRow>
      <StoryRow label="Two repositories" hint="The repository joins the icons once it varies.">
        <Frame listing={twoRepos} />
      </StoryRow>
      <StoryRow
        label="Starting and timing"
        hint="A thread being created on #503, and a Harvest timer running on #487."
      >
        <Frame
          listing={{
            ...baseline,
            harvest: {
              available: true,
              running: {
                externalId: "487",
                groupId: null,
                entryId: 1,
                startedAt: new Date(now - 40 * 60_000).toISOString(),
                projectName: "Widgets",
                taskName: "Development",
              },
            },
          }}
          starting={new Set(["acme/widgets#503"])}
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
      <StoryRow label="Empty" hint="No open pull requests.">
        <Frame listing={empty} height="h-[26rem]" />
      </StoryRow>
      <StoryRow
        label="Empty, repositories not swept"
        hint="Pull requests exist in a repository with no project checked out here."
      >
        <Frame listing={{ ...empty, skippedRepos: ["acme/gadgets"] }} height="h-[26rem]" />
      </StoryRow>
      <StoryRow
        label="Warnings"
        hint="A failed sweep, the 100 pull request ceiling, and a repository that could not refresh, above the rows."
      >
        <Frame
          listing={{
            ...baseline,
            lastError: "gh exited 1: HTTP 502 from api.github.com",
            truncated: true,
            failedRepos: ["acme/gadgets"],
          }}
        />
      </StoryRow>
      <StoryRow
        label="Repositories not swept"
        hint="A repository with no project checked out here, named below the list."
      >
        <Frame listing={{ ...baseline, skippedRepos: ["acme/gadgets"] }} />
      </StoryRow>
    </StoryCard>
  );
}

const LONG_TITLES = [
  "Lazy-load widget previews",
  "Add a gadget export endpoint",
  "Trim whitespace in widget names",
  "Cache gadget lookups per request",
  "Show widget counts in the sidebar",
  "Retry failed gadget webhooks",
  "Sort widgets by last edit",
  "Add alt text to gadget icons",
  "Paginate the widget audit log",
  "Warn before deleting a shared gadget",
];

/** Many pull requests waiting on reviewers. */
const long: Listing = {
  ...baseline,
  rows: [
    ...baseline.rows,
    ...LONG_TITLES.map((title, index) =>
      row({
        number: 600 + index,
        title,
        waitingOn: [index % 2 ? "hubber" : "octocat"],
        updatedAt: now - (index + 1) * 7 * HOUR,
      }),
    ),
  ],
};

/**
 * A long list: the pinned rows at the top, then every other pull request
 * newest first, with nothing folded.
 */
export function LongList() {
  return (
    <StoryCard>
      <StoryRow label="Long list" hint="Eleven more pull requests waiting on reviewers.">
        <Frame listing={long} />
      </StoryRow>
    </StoryCard>
  );
}

import type { ReactNode } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import type { HarvestTimerClient } from "bb-plugin-harvest/picker";
import { Icon } from "./components/ui/icon";
import { SyncStatus } from "./components/ui/sync-status";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  IssueListView,
  type HarvestPanelState,
  type Listing,
  type Row,
} from "./issues/list-view";

export default {
  title: "issue-sweep/Issue list",
};

/** The real clock, so the synced-ago label in the title bar agrees with the ages. */
const now = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const noop = () => {};

const STATUS_OPTIONS = ["Backlog", "Ready", "In Progress", "In Review", "Done"];

function row(overrides: Partial<Row> & Pick<Row, "number" | "title">): Row {
  const repo = overrides.repo ?? "acme/widgets";
  return {
    repo,
    url: `https://github.com/${repo}/issues/${overrides.number}`,
    labels: [],
    boardStatus: "Ready",
    onBoard: true,
    blockedBy: 0,
    subtasks: null,
    threadId: null,
    canSpawn: true,
    createdAt: now - 12 * DAY,
    updatedAt: now - 6 * HOUR,
    commentsCount: 0,
    ...overrides,
  };
}

const baselineRows: Row[] = [
  row({
    number: 214,
    title: "Let a widget remember its last export format",
    updatedAt: now - 3 * HOUR,
    commentsCount: 2,
  }),
  row({
    number: 187,
    title: "Widget picker loses focus after closing the preview",
    updatedAt: now - 2 * DAY,
  }),
  row({
    number: 231,
    title: "Show gadget quotas on the widget settings page",
    boardStatus: "In Progress",
    updatedAt: now - 40 * 60_000,
    commentsCount: 5,
    subtasks: { completed: 2, total: 5, source: "sub-issues" },
    threadId: "thr_fixture1",
  }),
  row({
    number: 156,
    title: "Document the widget import limits",
    boardStatus: "Backlog",
    updatedAt: now - 3 * 7 * DAY,
  }),
];

/** The panel with invented names. */
const baseline: Listing = {
  rows: baselineRows,
  statusOrder: ["Ready", "In Progress", "Backlog", "In Review"],
  statusOptions: STATUS_OPTIONS,
  countedStatuses: ["Ready", "In Progress", "In Review"],
  boardName: "Acme Board",
  sweptAt: now - 3 * 60_000,
  skippedRepos: [],
  truncated: false,
  lastError: null,
  harvest: { available: true, running: null },
};

/** Every section and every row variation at once. */
const everything: Listing = {
  ...baseline,
  rows: [
    ...baselineRows,
    row({
      number: 242,
      title: "Retry widget uploads that time out",
      updatedAt: now - 5 * HOUR,
      commentsCount: 1,
      subtasks: { completed: 1, total: 4, source: "tasks" },
    }),
    row({
      number: 219,
      title: "Rename widget slots to match the design doc",
      boardStatus: "In Review",
      updatedAt: now - 20 * HOUR,
      commentsCount: 8,
      threadId: "thr_fixture2",
    }),
    row({
      number: 248,
      title: "Gadget search returns archived widgets",
      boardStatus: "Ready",
      updatedAt: now - 15 * 60_000,
      canSpawn: false,
    }),
    row({
      number: 203,
      title: "Widgets lose their colour after a sync",
      boardStatus: null,
      onBoard: false,
      updatedAt: now - 4 * DAY,
      commentsCount: 3,
    }),
    row({
      number: 199,
      title: "Pick a default theme for new widgets",
      boardStatus: null,
      onBoard: true,
      updatedAt: now - 9 * DAY,
    }),
    row({
      number: 225,
      title: "Move the widget cache to a worker",
      boardStatus: "Ready",
      blockedBy: 1,
      updatedAt: now - 6 * DAY,
      subtasks: { completed: 0, total: 3, source: "sub-issues" },
    }),
    row({
      number: 176,
      title: "Retire the old widget exporter",
      boardStatus: "Stalled",
      updatedAt: now - 2 * 30 * DAY,
    }),
  ],
};

const multiRepo: Listing = {
  ...everything,
  rows: everything.rows.map((r, index) =>
    index % 2
      ? { ...r, repo: "acme/gadgets", url: r.url.replace("widgets", "gadgets") }
      : r,
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
  busyKeys = new Set(),
  height = "h-[30rem]",
}: {
  listing: Listing | null;
  starting?: Set<string>;
  busyKeys?: Set<string>;
  height?: string;
}): ReactNode {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`flex w-full flex-col rounded-lg border border-border bg-background ${height}`}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Icon name="ListTodo" className="size-4 text-muted-foreground" />
            Issues
          </span>
          <SyncStatus sweptAt={listing?.sweptAt ?? null} busy={false} onRefresh={noop} />
        </div>
        <div className="min-h-0 flex-1">
          <IssueListView
            listing={listing}
            now={now}
            busyKeys={busyKeys}
            starting={starting}
            harvest={listing ? harvestFor(listing) : harvestFor(baseline)}
            onPick={noop}
            onStart={noop}
            onOpen={noop}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * Four issues assigned to you, grouped under the Acme Board's columns in the
 * board's own order. The one in progress already has a thread.
 */
export function Baseline() {
  return (
    <StoryCard>
      <StoryRow
        label="Baseline"
        hint="Two ready, one in progress with a thread, one in the backlog."
      >
        <Frame listing={baseline} height="h-[36rem]" />
      </StoryRow>
    </StoryCard>
  );
}

/**
 * Every section and row the panel can draw: board columns in order, a column
 * the settings do not list, issues on no board, and blocked issues last. Rows
 * show sub-issue and task counts, comments, a thread, and a disabled start
 * button where no project is checked out. Then the same list across two
 * repositories, a thread being started with a timer running, and the panel
 * without Harvest.
 */
export function Rows() {
  return (
    <StoryCard>
      <StoryRow
        label="Every section"
        hint="Ready, In Progress, Backlog, In Review, an unlisted Stalled column, No board status, and Blocked."
      >
        <Frame listing={everything} height="h-[80rem]" />
      </StoryRow>
      <StoryRow
        label="Two repositories"
        hint="The repository joins the line under each title once it varies."
      >
        <Frame listing={multiRepo} height="h-[80rem]" />
      </StoryRow>
      <StoryRow
        label="Starting, saving, and timing"
        hint="A thread being created for #187, a status change saving on #156, and a Harvest timer running on #214."
      >
        <Frame
          listing={{
            ...baseline,
            harvest: {
              available: true,
              running: {
                externalId: "214",
                groupId: null,
                entryId: 1,
                startedAt: new Date(now - 25 * 60_000).toISOString(),
                projectName: "Widgets",
                taskName: "Development",
              },
            },
          }}
          starting={new Set(["acme/widgets#187"])}
          busyKeys={new Set(["acme/widgets#156"])}
          height="h-[36rem]"
        />
      </StoryRow>
      <StoryRow label="Without Harvest" hint="No clock beside the copy control.">
        <Frame
          listing={{ ...baseline, harvest: { available: false, running: null } }}
          height="h-[36rem]"
        />
      </StoryRow>
    </StoryCard>
  );
}

/**
 * The panel before the first listing arrives, with nothing assigned, and with
 * nothing visible because the only repository with issues has no project on
 * this machine.
 */
export function States() {
  const empty: Listing = { ...baseline, rows: [] };
  return (
    <StoryCard>
      <StoryRow label="Loading" hint="The first load, before the listing arrives.">
        <Frame listing={null} />
      </StoryRow>
      <StoryRow label="Empty" hint="No issues assigned to you.">
        <Frame listing={empty} />
      </StoryRow>
      <StoryRow
        label="Empty, repositories hidden"
        hint="Issues exist in a repository with no project checked out here."
      >
        <Frame listing={{ ...empty, skippedRepos: ["acme/gadgets"] }} />
      </StoryRow>
    </StoryCard>
  );
}

/**
 * What the panel shows when something is wrong: a failed sweep above the last
 * good rows, gh-context missing so no row can start a thread, and no board
 * configured so the status column cannot be changed.
 */
export function Warnings() {
  return (
    <StoryCard>
      <StoryRow
        label="Sweep failed"
        hint="The error, the 100 issue ceiling, and a skipped repository, above the last good rows."
      >
        <Frame
          listing={{
            ...baseline,
            lastError: "gh exited 1: HTTP 502 from api.github.com",
            truncated: true,
            skippedRepos: ["acme/gadgets"],
          }}
          height="h-[42rem]"
        />
      </StoryRow>
      <StoryRow
        label="gh-context missing"
        hint="Without thread links, no row offers to start a thread."
      >
        <Frame
          listing={{
            ...baseline,
            lastError:
              "Issue Sweep needs the gh-context plugin, which records which threads belong to which issues. Install it, then reload Issue Sweep.",
            rows: baselineRows.map((r) => ({ ...r, canSpawn: false, threadId: null })),
          }}
          height="h-[40rem]"
        />
      </StoryRow>
      <StoryRow
        label="No board"
        hint="No board is configured or it could not be read, so every issue lands in No board status and the status is read-only."
      >
        <Frame
          listing={{
            ...baseline,
            boardName: "",
            statusOptions: [],
            rows: baselineRows.map((r) => ({ ...r, boardStatus: null, onBoard: false })),
          }}
        />
      </StoryRow>
    </StoryCard>
  );
}

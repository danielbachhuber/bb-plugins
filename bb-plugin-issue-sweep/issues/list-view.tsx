import { useState, type ReactNode } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";
import { CopyLinkAction, LINE_ACTION } from "sweep-ui/actions";
import { SweepRow } from "sweep-ui/row";
import type { Flag, RunTone, Stage, SweepItem } from "sweep-ui/types";
import { writeLinkToClipboard } from "@/components/ui/copy-link";
import {
  LoadingGraphic,
  usePrefersReducedMotion,
} from "@/components/ui/loading-graphic";
import { EmptyGraphic } from "@/components/ui/empty-graphic";
import { Icon } from "@/components/ui/icon";
import { HarvestRowClock } from "bb-plugin-harvest/clock";
import type { HarvestTimerClient } from "bb-plugin-harvest/picker";
import { timerDefaultsForItem } from "bb-plugin-harvest/github";
import { commentsLabel, relativeTime, subtasksLabel } from "./format.js";
import {
  ISSUE_RUNS,
  isStale,
  lastActivity,
  needsYou,
  runOf,
  sortIssues,
  stageOf,
  statusGroups,
  type ListedIssue,
  type TierInputs,
} from "./tiers.js";

/**
 * What the Issues panel draws, given a listing. No RPC or realtime here, so
 * the stories can render every state from fixtures; app.tsx loads the listing
 * and owns the actions.
 */
export type Row = ListedIssue;

export type Listing = {
  rows: Row[];
  boardStages: string[];
  staleAfterDays: number;
  reviewStatus: string;
  statusOptions: string[];
  countedStatuses: string[];
  boardName: string;
  sweptAt: number | null;
  skippedRepos: string[];
  truncated: boolean;
  lastError: string | null;
  harvest: { available: boolean; running: RunningReference };
};

const DAY = 24 * 60 * 60_000;

/** What the picker offers when an issue has no status to show. */
const ADD_TO_BOARD = "Add to board";
const NO_STATUS = "No status";

/**
 * A status's colour, by what the status means rather than by its exact name,
 * so a board that calls its first column "Ready" and one that calls it "Ready
 * for Dev" read the same. Anything unrecognised stays muted: a wrong colour is
 * worse than no colour. Used for the picker's dot and the track's stages.
 */
function statusDot(status: string | null): string {
  const name = (status ?? "").toLowerCase();
  if (name.includes("progress")) return "bg-sky-500";
  if (name.includes("review")) return "bg-amber-500";
  if (name.includes("ready")) return "bg-emerald-500";
  return "bg-muted-foreground/40";
}

/** A stage's colour on the track: the status colour, with a visible grey for the rest. */
function stageColor(status: string): string {
  const color = statusDot(status);
  return color === "bg-muted-foreground/40" ? "bg-slate-400" : color;
}

/**
 * A picker in place of the track, for an issue the track cannot place: off
 * the board, with no status, or in a status the stages do not name. The last
 * shows its status as the picker's value, so it can be moved back onto the
 * track.
 *
 * An issue that is not on the board gets "Add to board" as its placeholder,
 * because adding and setting a status are one gesture — adding alone would
 * drop the issue into the board's "No Status" column, which is the state this
 * panel exists to get issues out of. One already in that column gets the same
 * picker reading "No status", since offering to add it would do nothing.
 */
function StatusCell({
  row,
  options,
  busy,
  onPick,
}: {
  row: Row;
  options: string[];
  busy: boolean;
  onPick: (status: string) => void;
}) {
  const placeholder = row.onBoard ? NO_STATUS : ADD_TO_BOARD;

  // No options means the board could not be read. The status is still worth
  // showing; only the ability to change it is lost.
  if (options.length === 0) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground">
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${statusDot(row.boardStatus)}`}
        />
        <span className="truncate">{row.boardStatus ?? placeholder}</span>
      </span>
    );
  }

  // A status the board no longer offers would otherwise select nothing and
  // render the row as blank, which reads as "not on the board".
  const offered =
    row.boardStatus && !options.includes(row.boardStatus)
      ? [row.boardStatus, ...options]
      : options;

  // Shrink-wrapped, not stretched to the track's width: a full-width select
  // pins the caret a long way from the text it belongs to.
  //
  // The border and hover fill are the shared Button's `outline` variant,
  // copied rather than composed because the control is a native <select> — it
  // cannot be a Button and still open the platform's own menu. The border is
  // what tells it apart from a status name, which is text you cannot change.
  return (
    <span
      className={`relative inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-input bg-transparent pl-2 pr-2 transition-colors ${
        busy ? "opacity-50" : "hover:bg-state-hover"
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${statusDot(row.boardStatus)}`}
      />
      <select
        aria-label={`Board status for #${row.number}`}
        title={row.boardStatus ?? placeholder}
        value={row.boardStatus ?? ""}
        disabled={busy}
        onChange={(event) => onPick(event.target.value)}
        className="max-w-full cursor-pointer appearance-none truncate bg-transparent pr-3.5 text-xs text-muted-foreground outline-none hover:text-foreground disabled:cursor-default"
      >
        <option value="" disabled>
          {busy ? "Saving…" : placeholder}
        </option>
        {offered.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 text-[0.6rem] text-muted-foreground"
      >
        ▾
      </span>
    </span>
  );
}


export type RunningReference =
  | {
      externalId: string;
      groupId: string | null;
      entryId: number;
      startedAt: string | null;
      projectName: string;
      taskName: string;
    }
  | null;

export interface HarvestPanelState {
  available: boolean;
  running: RunningReference;
  client: HarvestTimerClient;
  onStarted: () => void;
}

/**
 * Whether the running timer belongs to this row.
 *
 * The group is part of the comparison because Harvest can only filter
 * references by id: without it, every repository's #42 would light up
 * together.
 */
function isRunningFor(running: RunningReference, row: Row): boolean {
  if (running === null) return false;
  if (running.externalId !== String(row.number)) return false;

  const { groupId } = timerDefaultsForItem(row).externalReference;
  return running.groupId === null || running.groupId === groupId;
}

/**
 * Start or open the thread for one issue, as a labelled action in the row's
 * action line.
 */
function ThreadAction({
  row,
  isStarting,
  onStart,
  onOpen,
}: {
  row: Row;
  isStarting: boolean;
  onStart: (row: Row) => void;
  onOpen: (row: Row) => void;
}) {
  if (row.threadId) {
    return (
      <button type="button" className={LINE_ACTION} onClick={() => onOpen(row)}>
        <Icon name="MessageSquare" className="size-3" />
        Open thread
      </button>
    );
  }
  // Disabled with its reason as the label, rather than hidden: a row that
  // silently lacks the action reads as a bug.
  const label = !row.canSpawn ? "No project here" : isStarting ? "Starting…" : "Start thread";
  return (
    <button
      type="button"
      className={LINE_ACTION}
      disabled={!row.canSpawn || isStarting}
      title={row.canSpawn ? undefined : `No bb project is checked out for ${row.repo}`}
      onClick={() => onStart(row)}
    >
      <Icon
        name={isStarting ? "Spinner" : "MessageSquarePlus"}
        className={`size-3${isStarting ? " animate-spin" : ""}`}
      />
      {label}
    </button>
  );
}

function keyOf(row: Row): string {
  return `${row.repo}#${row.number}`;
}

/** The flags on a row's number line: stale in red, blocked in slate. */
function flagsFor(row: Row, inputs: TierInputs): Flag[] {
  const flags: Flag[] = [];
  if (isStale(row, inputs)) {
    const days = Math.floor((inputs.now - lastActivity(row)) / DAY);
    flags.push({ kind: "stale", text: `No activity for ${days} ${days === 1 ? "day" : "days"}` });
  }
  if (row.blockedBy > 0) {
    flags.push({
      kind: "blocked",
      text: `Blocked by ${row.blockedBy} ${row.blockedBy === 1 ? "issue" : "issues"}`,
    });
  }
  return flags;
}

/**
 * Nothing assigned, drawn as a list worked through rather than a board with
 * empty columns.
 *
 * Empty columns were the obvious picture and the wrong one: outlined rounded
 * rectangles with nothing in them are the loading-skeleton idiom, so the panel
 * would look like it was still fetching. A struck-through line with a tick
 * beside it cannot be mistaken for a placeholder — it can only mean done.
 *
 * The tick takes the same emerald the board glyph gives a card in its first
 * stage, so the two graphics stay in one family.
 */
function NoIssuesGraphic() {
  // Ragged lengths, longest first: a real list, not three copies of a bar.
  const LINES = [
    { y: 12, width: 92 },
    { y: 30, width: 74 },
    { y: 48, width: 84 },
  ];

  return (
    <svg
      role="img"
      aria-label="A checklist with every line ticked off and struck through"
      viewBox="0 0 132 60"
      className="h-[3.75rem] w-[8.25rem] text-muted-foreground"
      fill="none"
    >
      {LINES.map(({ y, width }) => (
        <g key={y}>
          {/* The tick, drawn as two strokes rather than a filled glyph so it
              keeps its weight at this size. */}
          <path
            d={`M4 ${y} L9 ${y + 5} L18 ${y - 5}`}
            className="stroke-emerald-500"
            strokeOpacity={0.75}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={`M28 ${y} H${28 + width}`}
            stroke="currentColor"
            strokeOpacity={0.28}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* The strike, at the same weight and a lower opacity: the line is
              still legible under it, the way a crossed-off item is. */}
          <path
            d={`M24 ${y} H${32 + width}`}
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * What this panel is waiting for, drawn as the board it is about to read.
 *
 * Three columns filling one at a time, which is what a sweep of the board
 * actually is: the plugin reads it stage by stage, it does not shuffle cards
 * around. The colours are not decoration — each card is the colour
 * `statusDot` gives that stage, ready then in progress then in review, so the
 * glyph is already teaching the legend the table below uses.
 *
 * Only the stage being read stays lit; the ones behind it dim rather than
 * disappear. Three chips at full strength at once would be a rainbow, and
 * would lose the sense of the sweep moving.
 *
 * One 2.4s cycle shared by every card, expressed as fractions of it, so the
 * loop restarts as a whole and nothing snaps back on its own.
 */
function SweepingBoard() {
  const still = usePrefersReducedMotion();

  // Where each card lands, and when it is the one being read. Held at 0.45
  // afterwards: read, not forgotten.
  const STAGES = [
    { fill: "fill-emerald-500", at: "0;0.1;0.15;0.3;0.35;0.86;0.96;1" },
    { fill: "fill-sky-500", at: "0;0.3;0.35;0.5;0.55;0.86;0.96;1" },
    { fill: "fill-amber-500", at: "0;0.5;0.55;0.7;0.8;0.86;0.96;1" },
  ];

  return (
    <LoadingGraphic caption="Sweeping your board">
      <svg
        role="img"
        aria-label="A board filling one column at a time"
        viewBox="0 0 168 60"
        className="h-[3.75rem] w-[10.5rem] text-muted-foreground"
        fill="none"
      >
        {STAGES.map((stage, index) => {
          const x = 4 + index * 56;
          const last = index === STAGES.length - 1;
          return (
            <g key={stage.fill}>
              <rect
                x={x}
                y={4}
                width={48}
                height={52}
                rx={7}
                stroke="currentColor"
                strokeOpacity={0.22}
              />
              <rect
                x={x + 8}
                y={16}
                width={32}
                height={14}
                rx={3}
                className={stage.fill}
                opacity={still ? (last ? 1 : 0.45) : 0}
              >
                {still ? null : (
                  <animate
                    attributeName="opacity"
                    dur="2.4s"
                    repeatCount="indefinite"
                    // The last card has no successor to dim for, so it holds
                    // full strength until the whole glyph fades.
                    values={
                      last
                        ? "0;0;1;1;1;1;0;0"
                        : "0;0;1;1;0.45;0.45;0;0"
                    }
                    keyTimes={stage.at}
                  />
                )}
              </rect>
            </g>
          );
        })}
      </svg>
    </LoadingGraphic>
  );
}

export interface IssueListViewProps {
  /** Null until the first listing arrives. */
  listing: Listing | null;
  /**
   * One clock for the whole render, so two rows updated a second apart never
   * disagree about what "now" is.
   */
  now: number;
  /** Rows whose status change is in flight, keyed `repo#number`. */
  busyKeys: ReadonlySet<string>;
  /** Rows whose thread is being started, keyed `repo#number`. */
  starting: ReadonlySet<string>;
  harvest: HarvestPanelState;
  onPick: (row: Row, status: string) => void;
  onStart: (row: Row) => void;
  onOpen: (row: Row) => void;
  /** Saves the row's note; "" deletes it. Resolves true once saved. */
  onNoteSave: (row: Row, body: string) => Promise<boolean>;
  /** The title was clicked, and the issue is about to open. */
  onOpenLink: (row: Row) => void;
}

export function IssueListView({
  listing,
  now,
  busyKeys,
  starting,
  harvest,
  onPick,
  onStart,
  onOpen,
  onNoteSave,
  onOpenLink,
}: IssueListViewProps): ReactNode {
  if (!listing) return <SweepingBoard />;

  const inputs: TierInputs = {
    countedStatuses: listing.countedStatuses,
    reviewStatus: listing.reviewStatus,
    boardStages: listing.boardStages,
    staleAfterDays: listing.staleAfterDays,
    now,
  };
  const stages: Stage[] = listing.boardStages.map((name) => ({ name, color: stageColor(name) }));

  // The repository only earns a place on the number line when it varies.
  const showRepo = new Set(listing.rows.map((row) => row.repo)).size > 1;

  const sorted = sortIssues(listing.rows, inputs);
  const rowsByKey = new Map(sorted.map((row) => [keyOf(row), row]));
  const items: SweepItem[] = sorted.map((row) => {
    const stage = stageOf(row, listing.boardStages);
    return {
      key: keyOf(row),
      runId: runOf(row, inputs),
      title: row.title,
      url: row.url,
      number: row.number,
      newComments: row.newComments,
      flags: flagsFor(row, inputs),
      // The age first: a Later row's single line shows only the first fact.
      facts: [
        relativeTime(row.updatedAt, now),
        showRepo ? row.repo : null,
        commentsLabel(row.commentsCount),
        subtasksLabel(row.subtasks),
      ].filter((fact): fact is string => fact !== null),
      parent: row.parent,
      note: row.note,
      stage,
      progress:
        row.subtasks && row.subtasks.total > 0
          ? { done: row.subtasks.completed, total: row.subtasks.total }
          : null,
      // A running timer must stay in view, and it lives in the action line.
      forceOpen: harvest.available && isRunningFor(harvest.running, row),
    };
  });

  return (
    <div className="h-full overflow-auto p-4 md:p-5">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        {listing.lastError ? (
          <p className="rounded-lg border border-border p-3 text-sm text-destructive">
            {listing.lastError}
          </p>
        ) : null}

        {listing.truncated ? (
          <p className="text-xs text-muted-foreground">
            The sweep hit the 100 issue ceiling, so this list may be
            incomplete.
          </p>
        ) : null}

        {listing.rows.length > 0 && listing.skippedRepos.length ? (
          <p className="text-xs break-words text-muted-foreground">
            Not swept: {listing.skippedRepos.join(", ")} — no project checked out here.
          </p>
        ) : null}

        {listing.rows.length === 0 ? (
          <EmptyGraphic
            graphic={<NoIssuesGraphic />}
            // The headline moves with the reason. "No issues assigned to
            // you" is untrue on a machine that simply cannot see them.
            headline={
              listing.skippedRepos.length
                ? "Nothing from the repositories checked out here."
                : "No issues assigned to you."
            }
          >
            {listing.skippedRepos.length ? (
              <>
                Not swept: {listing.skippedRepos.join(", ")} — no project checked out here. Add
                the project, or list the repository in this plugin's "Also sweep these
                repositories" setting.
              </>
            ) : (
              "Anything assigned to you shows up here."
            )}
          </EmptyGraphic>
        ) : (
          <SplitList
            items={items}
            rowsByKey={rowsByKey}
            groups={statusGroups(
              listing.rows.filter((row) => !needsYou(row, inputs)),
              inputs,
            )}
            stages={stages}
            busyKeys={busyKeys}
            renderStatus={(row) => (
              <StatusCell
                row={row}
                options={listing.statusOptions}
                busy={busyKeys.has(keyOf(row))}
                onPick={(status) => onPick(row, status)}
              />
            )}
            onNoteSave={(item, body) => {
              const row = rowsByKey.get(item.key);
              return row ? onNoteSave(row, body) : Promise.resolve(false);
            }}
            onOpenLink={(item) => {
              const row = rowsByKey.get(item.key);
              if (row) onOpenLink(row);
            }}
            // The timer sits at the bottom right of the row, apart from the actions.
            renderTrailing={(item) => {
              const row = rowsByKey.get(item.key);
              if (!row || !harvest.available) return null;
              return (
                <HarvestRowClock
                  surface="issues"
                  row={row}
                  running={isRunningFor(harvest.running, row) ? harvest.running : null}
                  client={harvest.client}
                  onChanged={harvest.onStarted}
                />
              );
            }}
            renderActions={(item) => {
              const row = rowsByKey.get(item.key);
              if (!row) return null;
              return (
                <>
                  <ThreadAction
                    row={row}
                    isStarting={starting.has(item.key)}
                    onStart={onStart}
                    onOpen={onOpen}
                  />
                  <CopyLinkAction
                    text={`${row.title} (#${row.number})`}
                    url={row.url}
                    write={writeLinkToClipboard}
                  />
                </>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Why a row is in "Needs you", as the word over its status picker. */
const REASONS: Record<string, { label: string; className: string }> = {
  "new-comments": { label: "New comments", className: "text-[#0b57d0] dark:text-[#a8c7fa]" },
  stale: { label: "Stale", className: "text-destructive-text" },
  working: { label: "Working", className: "text-[#c2620a] dark:text-[#f08a24]" },
  "to-start": { label: "To start", className: "text-muted-foreground" },
};

const TONES = new Map<string, RunTone>(ISSUE_RUNS.map((run) => [run.id, run.tone]));

interface SplitListProps {
  /** Every row, already sorted. */
  items: SweepItem[];
  rowsByKey: Map<string, Row>;
  /** The rows that do not need you, grouped by status. */
  groups: ReturnType<typeof statusGroups>;
  stages: Stage[];
  busyKeys: ReadonlySet<string>;
  renderStatus: (row: Row) => ReactNode;
  renderActions: (item: SweepItem) => ReactNode;
  renderTrailing: (item: SweepItem) => ReactNode;
  onNoteSave: (item: SweepItem, body: string) => Promise<boolean>;
  onOpenLink: (item: SweepItem) => void;
}

/**
 * Two columns. On the left, only what needs you, every row open with its
 * actions, why it is there, and a status picker. On the right, everything
 * else grouped by status, one line each, opening to the same actions.
 */
function SplitList({
  items,
  rowsByKey,
  groups,
  stages,
  busyKeys,
  renderStatus,
  renderActions,
  renderTrailing,
  onNoteSave,
  onOpenLink,
}: SplitListProps) {
  // Rows opened by hand in the right column. Open state lives only as long as the panel.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const itemsByKey = new Map(items.map((item) => [item.key, item]));
  const mine = items.filter((item) => REASONS[item.runId]);
  const restCount = groups.reduce((total, group) => total + group.rows.length, 0);

  const rowFor = (item: SweepItem, side: "mine" | "rest") => {
    const row = rowsByKey.get(item.key)!;
    const open = side === "mine" || item.forceOpen === true || opened[item.key] === true;
    const reason = REASONS[item.runId];
    return (
      <SweepRow
        key={item.key}
        item={item}
        tier={side === "mine" ? "now" : "later"}
        open={open}
        chevron={side === "rest"}
        onToggle={
          side === "rest" && !item.forceOpen
            ? () => setOpened((current) => ({ ...current, [item.key]: !open }))
            : undefined
        }
        tone={TONES.get(item.runId)}
        stages={stages}
        onOpenLink={() => onOpenLink(item)}
        Link={UrlLink}
        actions={renderActions(item)}
        trailing={renderTrailing(item)}
        editing={editing === item.key}
        onEditNote={() => setEditing(item.key)}
        onNoteSave={async (body) => {
          const saved = await onNoteSave(item, body);
          if (saved) setEditing((current) => (current === item.key ? null : current));
          return saved;
        }}
        onNoteCancel={() => setEditing(null)}
        busy={busyKeys.has(item.key)}
        renderTrack={(_, line) =>
          line ? null : (
            <div className="flex w-36 shrink-0 flex-col items-end gap-1 self-start">
              {reason ? (
                <span className={`text-xs font-medium ${reason.className}`}>{reason.label}</span>
              ) : null}
              {renderStatus(row)}
            </div>
          )
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section aria-label="Needs you" className="min-w-0 lg:basis-3/5">
        <h2 className="mb-1.5 text-sm font-medium text-foreground">
          Needs you <span className="text-muted-foreground">{mine.length}</span>
        </h2>
        {mine.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
            {mine.map((item) => rowFor(item, "mine"))}
          </ul>
        ) : (
          <p className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
            Nothing needs you right now.
          </p>
        )}
      </section>
      {restCount ? (
        <section aria-label="Everything else" className="min-w-0 lg:basis-2/5">
          <h2 className="mb-1.5 text-sm font-medium text-foreground">
            Everything else <span className="text-muted-foreground">{restCount}</span>
          </h2>
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.name}>
                <h3 className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  {group.blocked ? (
                    <Icon name="CircleX" className="size-3" />
                  ) : (
                    <span aria-hidden className={`size-2 rounded-full ${statusDot(group.status)}`} />
                  )}
                  {group.name}
                  <span>{group.rows.length}</span>
                </h3>
                <ul className="divide-y divide-border rounded-lg border border-border bg-card px-4">
                  {group.rows.map((row) => {
                    const item = itemsByKey.get(keyOf(row));
                    return item ? rowFor(item, "rest") : null;
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

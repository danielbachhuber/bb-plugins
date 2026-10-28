// The open issues one person holds, each row carrying a bar from when the
// issue was opened to today: grey in Triage, amber in Assign ownership, blue
// once it was theirs, with a dot at its last change. Each row ends with how
// long it has been theirs and whether anything has happened since. Display
// only.
import { useState, type ReactNode } from "react";

import type { AssignedIssue } from "@/dashboard/contract";

import { ItemRow } from "./item-row";
import type { ThreadSeed } from "./thread-seed";

// Written out rather than set as Tailwind classes: bb's stylesheet is
// prebuilt, so an arbitrary colour class a plugin invents has no rule.
const TRIAGE = "#c9ced6";
const OWNERSHIP = "#e7b36a";
const THEIRS = "#2a78d6";
const OLD = "#d9820a";
const UNPLANNED = "#7c8794";

const DAY = 86_400_000;
const PAGE = 10;
const BAR = 320;
const END = 262;
/** The gap after the words and the two row actions: what sits right of them in a row. */
const ACTIONS = 46;

/** Quiet is normal for an issue taken this week, so "nothing since" waits this long. */
export const QUIET_AFTER_DAYS = 14;
/** Theirs this long is drawn in amber, and in bold amber when nothing has happened since. */
export const OLD_AFTER_DAYS = 90;

const daysAgo = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));

export function heldDays(issue: AssignedIssue, now: number): number {
  return daysAgo(issue.assignedAt, now);
}

/** Nothing has changed on it since the day it became theirs. */
export function isQuiet(issue: AssignedIssue): boolean {
  return Date.parse(issue.updatedAt) - Date.parse(issue.assignedAt) < DAY;
}

/** The end of the row as a sentence, and whether it is the case to flag. */
export function endWords(issue: AssignedIssue, now: number): { held: string; since: string | null; old: boolean; stuck: boolean } {
  const days = heldDays(issue, now);
  const quiet = isQuiet(issue);
  const changed = daysAgo(issue.updatedAt, now);
  const since = !quiet
    ? `last change ${changed === 0 ? "today" : changed === 1 ? "yesterday" : `${changed} days ago`}`
    : days >= QUIET_AFTER_DAYS
      ? "nothing since"
      : null;
  const old = days >= OLD_AFTER_DAYS;
  return { held: `theirs ${days} ${days === 1 ? "day" : "days"}`, since, old, stuck: old && quiet };
}

function percentile(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

/** The line under the heading: how long they have held them, and how many have gone quiet. */
export function issuesLine(issues: readonly AssignedIssue[], now: number): { median: number; p90: number; quiet: number } {
  const held = issues.map((issue) => heldDays(issue, now)).sort((a, b) => a - b);
  return {
    median: percentile(held, 0.5),
    p90: percentile(held, 0.9),
    quiet: issues.filter((issue) => isQuiet(issue) && heldDays(issue, now) >= QUIET_AFTER_DAYS).length,
  };
}

const MARKS: Array<[number, string]> = [
  [0, "today"],
  [30, "1 month"],
  [90, "3 months"],
  [180, "6 months"],
  [365, "1 year"],
  [730, "2 years"],
];

/** The marks that fit the span, nearest first, leaving out any that would crowd the one before it. */
export function axisMarks(spanDays: number, width: number): Array<{ days: number; label: string }> {
  const kept: Array<{ days: number; label: string }> = [];
  for (const [days, label] of MARKS) {
    if (days > spanDays) break;
    const previous = kept.at(-1);
    if (previous !== undefined && ((days - previous.days) / spanDays) * width < 64) continue;
    kept.push({ days, label });
  }
  const last = kept.at(-1);
  if (last !== undefined && last.days > 0) last.label = `${last.label} ago`;
  return kept;
}

function Bar({ issue, now, span }: { issue: AssignedIssue; now: number; span: number }) {
  const height = 14;
  const x = (iso: string) => BAR * (1 - Math.min(span, daysAgo(iso, now)) / span);
  const opened = x(issue.openedAt);
  const assigned = x(issue.assignedAt);
  // Planned after it was assigned means it never waited for an owner.
  const planned = issue.plannedAt === null ? null : Math.min(x(issue.plannedAt), assigned);
  const triageEnd = planned ?? assigned;
  const segment = (from: number, to: number, fill: string, dashed = false) =>
    to - from < 0.5 ? null : (
      <rect
        x={from}
        y={3}
        width={to - from}
        height={height - 6}
        rx={1}
        fill={dashed ? "transparent" : fill}
        stroke={dashed ? UNPLANNED : undefined}
        strokeDasharray={dashed ? "2 2" : undefined}
      />
    );
  return (
    <svg width={BAR} height={height} className="block shrink-0 overflow-visible" aria-hidden>
      {segment(opened, triageEnd, TRIAGE, issue.plannedAt === null)}
      {planned === null ? null : segment(planned, assigned, OWNERSHIP)}
      {segment(assigned, BAR, THEIRS)}
      <circle cx={x(issue.updatedAt)} cy={height / 2} r={2.6} fill="#fff" stroke="#1f2328" strokeWidth={1.2} />
    </svg>
  );
}

function Words({ issue, now }: { issue: AssignedIssue; now: number }) {
  const words = endWords(issue, now);
  return (
    <span className="whitespace-nowrap" style={{ width: END }}>
      <span style={words.old ? { color: OLD } : undefined}>{words.held}</span>
      {words.since === null ? null : (
        <>
          , <span style={words.stuck ? { color: OLD, fontWeight: 600 } : undefined}>{words.since}</span>
        </>
      )}
    </span>
  );
}

function Swatch({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-sm"
        style={{ width: 9, height: 9, background: dashed ? "transparent" : color, border: dashed ? `1px dashed ${color}` : undefined }}
      />
      {label}
    </span>
  );
}

export function StageLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <Swatch color={TRIAGE} label="Triage" />
      <Swatch color={OWNERSHIP} label="Assign ownership" />
      <Swatch color={THEIRS} label="theirs" />
      <span className="inline-flex items-center gap-1.5">
        <svg width={9} height={9} aria-hidden>
          <circle cx={4.5} cy={4.5} r={3} fill="#fff" stroke="#1f2328" strokeWidth={1.2} />
        </svg>
        last change
      </span>
    </span>
  );
}

/** The time axis, laid out like a row so its marks sit over the bars. */
function Axis({ span }: { span: number }) {
  return (
    <li className="px-3 pb-0.5 pt-1.5" aria-hidden>
      <div className="flex items-center justify-end gap-3 text-[11px] text-muted-foreground">
        <span className="relative h-4 shrink-0" style={{ width: BAR }}>
          {axisMarks(span, BAR).map(({ days, label }) => (
            <span
              key={label}
              className="absolute whitespace-nowrap"
              style={{
                left: BAR * (1 - days / span),
                transform: days === 0 ? "translateX(-100%)" : days === span ? undefined : "translateX(-50%)",
              }}
            >
              {label}
            </span>
          ))}
        </span>
        <span className="shrink-0" style={{ width: END + ACTIONS }} />
      </div>
    </li>
  );
}

function PageButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted disabled:cursor-default disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function AssignedIssues({
  issues,
  onThread,
  now,
}: {
  /** Longest held first, as the server sends them. */
  issues: readonly AssignedIssue[];
  onThread: (seed: ThreadSeed, threadId: string | null) => void;
  now: number;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(issues.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = issues.slice(current * PAGE, current * PAGE + PAGE);
  // Every bar shares one scale, back to the oldest issue on any page, and a month at least.
  const span = Math.max(30, ...issues.map((issue) => daysAgo(issue.openedAt, now)));
  const line = issues.length === 0 ? null : issuesLine(issues, now);
  const strong = (children: ReactNode) => <span className="font-medium text-foreground">{children}</span>;

  return (
    <section className="mt-6" aria-labelledby="person-issues">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="person-issues" className="text-base font-semibold">
          Issues assigned to them
          <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{issues.length}</span>
        </h2>
        {issues.length === 0 ? null : <StageLegend />}
      </div>
      {line === null ? (
        <p className="mt-2 text-sm text-muted-foreground">No open issues are assigned to them.</p>
      ) : (
        <>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            Half theirs within {strong(`${line.median} ${line.median === 1 ? "day" : "days"}`)}, 1 in 10 for over{" "}
            {strong(`${line.p90} days`)} · {strong(line.quiet)} theirs over 2 weeks with nothing since
          </p>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
            <Axis span={span} />
            {shown.map((issue) => {
              const words = endWords(issue, now);
              return (
                <ItemRow
                  key={issue.number}
                  number={issue.number}
                  title={issue.title}
                  url={issue.url}
                  threadId={issue.threadId}
                  onThread={() =>
                    onThread(
                      {
                        kind: "issue",
                        number: issue.number,
                        title: issue.title,
                        url: issue.url,
                        meta: words.since === null ? words.held : `${words.held}, ${words.since}`,
                      },
                      issue.threadId,
                    )
                  }
                  facts={
                    <span className="inline-flex items-center gap-3">
                      <Bar issue={issue} now={now} span={span} />
                      <Words issue={issue} now={now} />
                    </span>
                  }
                />
              );
            })}
          </ul>
          {pages < 2 ? null : (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {current * PAGE + 1}–{Math.min(issues.length, current * PAGE + PAGE)} of {issues.length}
              </span>
              <span className="flex items-center gap-1">
                <PageButton label="Previous" onClick={() => setPage(current - 1)} disabled={current === 0} />
                <PageButton label="Next" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} />
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Every open milestone as a row: when it is due, how much of it is closed,
// what is open and unheld, and whether issues were added to it faster than
// they closed over the period. A row opens the milestone's page. Display only.
import { useState } from "react";

import type { MilestoneSummary } from "@/dashboard/contract";
import { pageOf } from "@/dashboard/paging";

import { PageButton } from "./person-lists";

/** Milestones per page; the rest are a click away. */
export const MILESTONES_PER_PAGE = 10;

// Written out rather than set as Tailwind classes: bb's stylesheet is
// prebuilt, so an arbitrary colour class a plugin invents has no rule.
export const MILESTONE_COLORS = {
  added: "#2a78d6",
  closed: "#1baf7a",
  growing: "#d9820a",
  steady: "#7c8794",
  track: "#e3e6ea",
  late: "#c9372c",
};

const DAY = 86_400_000;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** "due Sep 30, 54 days ago", "due Dec 1, in 8 days", "due Dec 15", or "no due date". */
export function dueWords(due: number | null, now: number): { text: string; tone: "late" | "soon" | "plain" | "none" } {
  if (due === null) return { text: "no due date", tone: "none" };
  const date = new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  // A due date is a calendar day; it is late from the day after.
  const days = Math.floor((due + DAY - now) / DAY);
  if (days < 0) return { text: `due ${date}, ${-days} ${-days === 1 ? "day" : "days"} ago`, tone: "late" };
  if (days === 0) return { text: `due ${date}, today`, tone: "soon" };
  if (days <= 14) return { text: `due ${date}, in ${days} ${days === 1 ? "day" : "days"}`, tone: "soon" };
  return { text: `due ${date}`, tone: "plain" };
}

export const DUE_CLASS = {
  late: "font-medium text-destructive",
  soon: "text-[#b4530a] dark:text-[#e59a3a]",
  plain: "text-muted-foreground",
  none: "text-muted-foreground",
};

/** "+24 added · 19 closed", or "nothing moved". */
export function AddedClosed({ added, closed }: { added: number; closed: number }) {
  if (added === 0 && closed === 0) return <span className="text-muted-foreground">nothing moved</span>;
  return (
    <span className="tabular-nums">
      <span style={{ color: MILESTONE_COLORS.added }}>+{added} added</span>
      <span className="text-muted-foreground"> · </span>
      <span style={{ color: MILESTONE_COLORS.closed }}>{closed} closed</span>
    </span>
  );
}

/**
 * Issues in it, and closed, at the start and end of each bucket. Worked
 * backwards from today's totals, so the line ends where GitHub's counts do.
 */
function series(m: MilestoneSummary): { total: number[]; closed: number[] } {
  const total = [m.open + m.closed - sum(m.added)];
  const closed = [m.closed - sum(m.closedIn)];
  m.added.forEach((n, i) => {
    total.push(total[i] + n);
    closed.push(closed[i] + m.closedIn[i]);
  });
  return { total, closed };
}

/** A small burn-up: the line is every issue in it, amber when issues came in faster than they closed; the area is what is closed. */
function Sparkline({ milestone, width = 96, height = 24 }: { milestone: MilestoneSummary; width?: number; height?: number }) {
  const s = series(milestone);
  const steps = Math.max(1, s.total.length - 1);
  const most = Math.max(1, ...s.total);
  const px = (i: number) => (i / steps) * (width - 2) + 1;
  const py = (v: number) => height - 1 - (v / most) * (height - 3);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join("");
  const growing = sum(milestone.added) > sum(milestone.closedIn);
  return (
    <svg width={width} height={height} className="block overflow-visible" aria-hidden>
      <path d={`${line(s.closed)}L${px(steps)},${height - 1}L${px(0)},${height - 1}Z`} fill={MILESTONE_COLORS.closed} opacity={0.3} />
      <path d={line(s.closed)} fill="none" stroke={MILESTONE_COLORS.closed} strokeWidth={1.5} />
      <path d={line(s.total)} fill="none" stroke={growing ? MILESTONE_COLORS.growing : MILESTONE_COLORS.steady} strokeWidth={1.5} />
    </svg>
  );
}

const HATCH = `repeating-linear-gradient(135deg, ${MILESTONE_COLORS.added}66 0 2px, transparent 2px 5px)`;

/** Share closed in green; the open issues added during the period hatched at the far end. */
export function Progress({ milestone, width = 140 }: { milestone: MilestoneSummary; width?: number }) {
  const total = milestone.open + milestone.closed;
  const done = total === 0 ? 0 : milestone.closed / total;
  const fresh = total === 0 ? 0 : Math.min(milestone.open, milestone.openAdded) / total;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 overflow-hidden rounded-full" style={{ width, background: MILESTONE_COLORS.track }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${done * 100}%`, background: MILESTONE_COLORS.closed }} />
        <div className="absolute inset-y-0 right-0" style={{ width: `${fresh * 100}%`, backgroundImage: HATCH }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{Math.round(done * 100)}%</span>
    </div>
  );
}

export function MilestonesTable({
  milestones,
  periodLabel,
  onOpenMilestone,
  now = Date.now(),
  initialPage = 0,
}: {
  milestones: readonly MilestoneSummary[];
  /** What the period is called in a sentence, such as "six weeks". */
  periodLabel: string;
  onOpenMilestone: (number: number) => void;
  now?: number;
  /** The page to open on, for stories. */
  initialPage?: number;
}) {
  const [wanted, setPage] = useState(initialPage);
  // Clamped, because a shorter period can leave a reader past the last page.
  const paging = pageOf(milestones.length, wanted, MILESTONES_PER_PAGE);
  if (milestones.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">No open milestones.</p>;
  }
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: MILESTONE_COLORS.closed }} /> closed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundImage: HATCH }} /> open, added over {periodLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: MILESTONE_COLORS.growing }} /> issues in it, when added faster
          than closed
        </span>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1.5 font-normal">Milestone</th>
            <th className="py-1.5 font-normal">Progress</th>
            <th className="py-1.5 text-right font-normal">Open</th>
            <th className="py-1.5 text-right font-normal">Nobody assigned</th>
            <th className="py-1.5 pl-6 font-normal">Over {periodLabel}</th>
            <th className="py-1.5 font-normal">
              <span className="sr-only">Issues in it, and closed</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {milestones.slice(paging.offset, paging.to).map((milestone) => {
            const due = dueWords(milestone.due, now);
            return (
              <tr
                key={milestone.number}
                onClick={() => onOpenMilestone(milestone.number)}
                className="cursor-pointer border-b border-border/60 hover:bg-muted/40"
              >
                <td className="max-w-[300px] py-2 pr-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenMilestone(milestone.number);
                    }}
                    className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline"
                    title={milestone.title}
                  >
                    {milestone.title}
                  </button>
                  <div className={`text-xs ${DUE_CLASS[due.tone]}`}>{due.text}</div>
                </td>
                <td className="py-2">
                  <Progress milestone={milestone} />
                </td>
                <td className="py-2 text-right tabular-nums">{milestone.open}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{milestone.nobody}</td>
                <td className="py-2 pl-6 text-xs">
                  <AddedClosed added={sum(milestone.added)} closed={sum(milestone.closedIn)} />
                </td>
                <td className="py-2 pl-3">
                  <Sparkline milestone={milestone} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {paging.pages < 2 ? null : (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {paging.from}–{paging.to} of {milestones.length}
          </span>
          <span className="flex items-center gap-1">
            <PageButton label="Previous" onClick={() => setPage(paging.page - 1)} disabled={paging.page === 0} />
            <PageButton label="Next" onClick={() => setPage(paging.page + 1)} disabled={paging.page >= paging.pages - 1} />
          </span>
        </div>
      )}
    </>
  );
}

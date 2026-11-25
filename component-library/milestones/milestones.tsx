// A repository's milestones, drawn the same way wherever a plugin lists them:
// when each is due, how much of it is closed, whether issues are being added
// faster than they close, and, on one milestone's page, its history and where
// its open issues stand. Display only: each plugin works out the numbers from
// its own data and passes them in.
import { useState } from "react";

/** One open milestone, as a row of the table. */
export interface MilestoneSummary {
  number: number;
  title: string;
  url: string;
  /** Epoch ms; null when it has no due date. */
  due: number | null;
  /** GitHub's own counts. */
  open: number;
  closed: number;
  /** Open issues in it with nobody assigned. */
  nobody: number;
  /** Issues added to it in each bucket of the period. */
  added: number[];
  /** Issues in it that closed in each bucket of the period. */
  closedIn: number[];
  /** Open issues that were added during the period. */
  openAdded: number;
}

/** Issues in a milestone and how many had closed, at each point since it was created. */
export interface MilestoneHistory {
  /** Epoch ms of each point, oldest first. */
  at: number[];
  total: number[];
  closed: number[];
}

/** Where an open issue stands, from nobody on it to a pull request approved. */
export type IssueStanding = "nobody" | "assigned" | "draft" | "review" | "approved";

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

/** Most advanced first, as a list of open issues reads top to bottom. */
export const STANDINGS: ReadonlyArray<{ key: IssueStanding; label: string; note: string; color: string }> = [
  { key: "approved", label: "Approved", note: "a pull request approved, not merged", color: "#9b6cbf" },
  { key: "review", label: "In review", note: "a pull request open for review", color: "#2a78d6" },
  { key: "draft", label: "Draft pull request", note: "a pull request, still a draft", color: "#7fb0ea" },
  { key: "assigned", label: "Assigned", note: "someone holds it; no pull request yet", color: "#d9820a" },
  { key: "nobody", label: "Nobody assigned", note: "no one has taken it", color: "#7c8794" },
];

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
export function Sparkline({ milestone, width = 96, height = 24 }: { milestone: MilestoneSummary; width?: number; height?: number }) {
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

/** What each mark in the table means. */
export function MilestonesLegend({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
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

/**
 * One table of milestones, a row each, with a row opening the milestone's
 * page. Pages through them `perPage` at a time; `perPage` of 0 shows them all.
 */
export function MilestonesTable({
  milestones,
  periodLabel,
  onOpenMilestone,
  now = Date.now(),
  perPage = 10,
  initialPage = 0,
  legend = true,
  fixedColumns = false,
}: {
  milestones: readonly MilestoneSummary[];
  /** What the period is called in a sentence, such as "six weeks". */
  periodLabel: string;
  onOpenMilestone: (number: number) => void;
  now?: number;
  perPage?: number;
  /** The page to open on, for stories. */
  initialPage?: number;
  /** Off where one legend sits above several tables. */
  legend?: boolean;
  /** Set column widths, so several tables stacked on one page line up. */
  fixedColumns?: boolean;
}) {
  const [wanted, setPage] = useState(initialPage);
  if (milestones.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">No open milestones.</p>;
  }
  const size = perPage > 0 ? perPage : milestones.length;
  const pages = Math.max(1, Math.ceil(milestones.length / size));
  // Clamped, because a shorter period can leave a reader past the last page.
  const page = Math.min(Math.max(0, wanted), pages - 1);
  const offset = page * size;
  const to = Math.min(milestones.length, offset + size);
  return (
    <>
      {legend ? (
        <div className="mt-3">
          <MilestonesLegend periodLabel={periodLabel} />
        </div>
      ) : null}
      <table className={`mt-2 w-full text-sm ${fixedColumns ? "table-fixed" : ""}`}>
        {fixedColumns ? (
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "11%" }} />
          </colgroup>
        ) : null}
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
          {milestones.slice(offset, to).map((milestone) => {
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
      {pages < 2 ? null : (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {offset + 1}–{to} of {milestones.length}
          </span>
          <span className="flex items-center gap-1">
            <PageButton label="Previous" onClick={() => setPage(page - 1)} disabled={page === 0} />
            <PageButton label="Next" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} />
          </span>
        </div>
      )}
    </>
  );
}

/** Every issue in it, and how many closed, since it was created; the period shaded and the due date marked. */
export function MilestoneHistoryChart({
  history,
  due,
  periodStart,
  periodLabel,
}: {
  history: MilestoneHistory;
  due: number | null;
  periodStart: number;
  periodLabel: string;
}) {
  const W = 960;
  const H = 190;
  const L = 34;
  const R = 10;
  const T = 14;
  const B = H - 24;
  const { at, total, closed } = history;
  if (at.length < 2) return <p className="text-xs text-muted-foreground">Not enough history yet.</p>;
  const first = at[0];
  const last = at.at(-1)!;
  const most = Math.max(1, ...total);
  const px = (t: number) => L + ((t - first) / Math.max(1, last - first)) * (W - L - R);
  const py = (v: number) => B - (v / most) * (B - T);
  const line = (vs: readonly number[]) => vs.map((v, i) => `${i ? "L" : "M"}${px(at[i]).toFixed(1)},${py(v).toFixed(1)}`).join("");
  const step = most > 60 ? 50 : most > 30 ? 20 : most > 12 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(most / step) + 1 }, (_, i) => i * step);
  const shadeFrom = Math.max(first, periodStart);
  const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${total.at(-1)} issues in it, ${closed.at(-1)} closed`}>
      {shadeFrom < last ? (
        <rect x={px(shadeFrom)} y={T} width={px(last) - px(shadeFrom)} height={B - T} fill={MILESTONE_COLORS.added} opacity={0.06} />
      ) : null}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke={MILESTONE_COLORS.track} />
          <text x={L - 6} y={py(t) + 3} textAnchor="end" fontSize={10} fill={MILESTONE_COLORS.steady}>
            {t}
          </text>
        </g>
      ))}
      <path d={`${line(closed)}L${px(last)},${B}L${px(first)},${B}Z`} fill={MILESTONE_COLORS.closed} opacity={0.3} />
      <path d={line(closed)} fill="none" stroke={MILESTONE_COLORS.closed} strokeWidth={2} />
      <path d={line(total)} fill="none" stroke={MILESTONE_COLORS.growing} strokeWidth={2} />
      {due !== null && due >= first && due <= last ? (
        <g>
          <line x1={px(due)} x2={px(due)} y1={T} y2={B} stroke={MILESTONE_COLORS.late} strokeDasharray="3 2" />
          <text x={px(due) - 4} y={T + 10} textAnchor="end" fontSize={10} fill={MILESTONE_COLORS.late}>
            due
          </text>
        </g>
      ) : null}
      <text x={L} y={H - 6} fontSize={10} fill={MILESTONE_COLORS.steady}>
        {day(first)}
      </text>
      {shadeFrom < last ? (
        <text x={(px(shadeFrom) + px(last)) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={MILESTONE_COLORS.added}>
          {periodLabel}
        </text>
      ) : null}
      <text x={W - R} y={H - 6} textAnchor="end" fontSize={10} fill={MILESTONE_COLORS.steady}>
        today
      </text>
    </svg>
  );
}

/** One bar across the page: where the open issues stand, then what has closed. */
export function StandingStrip({ standings, closed }: { standings: readonly IssueStanding[]; closed: number }) {
  const segments = [
    ...[...STANDINGS].reverse().map((standing) => ({
      label: standing.label,
      color: standing.color,
      count: standings.filter((key) => key === standing.key).length,
    })),
    { label: "Closed", color: MILESTONE_COLORS.closed, count: closed },
  ];
  const total = sum(segments.map((segment) => segment.count));
  if (total === 0) return null;
  return (
    <div className="mt-4">
      <div className="flex h-6 overflow-hidden rounded">
        {segments.map((segment) =>
          segment.count === 0 ? null : (
            <div
              key={segment.label}
              title={`${segment.label}: ${segment.count}`}
              className="flex items-center justify-center text-[11px] font-semibold text-white"
              style={{ width: `${(segment.count / total) * 100}%`, background: segment.color }}
            >
              {segment.count / total > 0.03 ? segment.count : null}
            </div>
          ),
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: segment.color }} />
            {segment.label} <span className="tabular-nums">{segment.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

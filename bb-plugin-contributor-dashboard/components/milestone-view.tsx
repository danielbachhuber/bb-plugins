// One milestone's page: when it is due and how it moved over the period, a
// strip of where its issues stand, the issues in it and closed since it was
// created, then every open issue grouped by where it stands, and the closed
// ones behind a toggle.
import { useState, type ReactNode } from "react";

import type { IssueStanding, MilestoneDetailResult } from "@/dashboard/contract";
import type { Selection } from "@/dashboard/period";

import { ItemRow } from "./item-row";
import { AddedClosed, DUE_CLASS, dueWords, MILESTONE_COLORS } from "./milestones-section";
import { PageHeader } from "./page-header";
import { PeriodPicker } from "./period-picker";
import type { ThreadSeed } from "./thread-seed";

const DAY = 86_400_000;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Most advanced first, as the list reads top to bottom. */
const STANDINGS: Array<{ key: IssueStanding; label: string; note: string; color: string }> = [
  { key: "approved", label: "Approved", note: "a pull request approved, not merged", color: "#9b6cbf" },
  { key: "review", label: "In review", note: "a pull request open for review", color: "#2a78d6" },
  { key: "draft", label: "Draft pull request", note: "a pull request, still a draft", color: "#7fb0ea" },
  { key: "assigned", label: "Assigned", note: "someone holds it; no pull request yet", color: "#d9820a" },
  { key: "nobody", label: "Nobody assigned", note: "no one has taken it", color: "#7c8794" },
];

/** Left to right, from not started to closed. */
const STRIP = [...STANDINGS].reverse();

function ago(at: number, now: number): string {
  const days = Math.max(0, Math.floor((now - at) / DAY));
  return days === 0 ? "today" : `${days}d ago`;
}

function Panel({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{note}</span>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** Every issue in it, and how many closed, since it was created; the period shaded and the due date marked. */
function History({
  history,
  due,
  periodStart,
  periodLabel,
}: {
  history: MilestoneDetailResult["history"];
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
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${px(at[i]).toFixed(1)},${py(v).toFixed(1)}`).join("");
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

export function MilestoneView({
  number,
  selection,
  onSelect,
  data,
  error,
  onBack,
  onOpenPerson,
  onOpenTeam,
  periodLabel,
  onThread,
  now = Date.now(),
  initialShowClosed = false,
}: {
  number: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  data: MilestoneDetailResult | null;
  error: string | null;
  onBack: () => void;
  onOpenPerson: (login: string) => void;
  onOpenTeam?: (slug: string) => void;
  /** What the period is called in a sentence, such as "six weeks". */
  periodLabel: string;
  onThread: (seed: ThreadSeed, threadId: string | null) => void;
  now?: number;
  /** Opens the closed list, for stories. */
  initialShowClosed?: boolean;
}) {
  const [showClosed, setShowClosed] = useState(initialShowClosed);
  const message = error ?? data?.sync.error ?? null;
  const milestone = data?.milestone ?? null;
  const periodStart = data?.buckets[0]?.start ?? now;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <PageHeader
          repository={data?.repository ?? null}
          onHome={onBack}
          everyone={data?.everyone ?? []}
          everyTeam={data?.everyTeam ?? []}
          onOpenPerson={onOpenPerson}
          onOpenTeam={onOpenTeam}
          period={<PeriodPicker selection={selection} onSelect={onSelect} />}
          title={milestone?.title ?? (data === null ? "" : `Milestone ${number}`)}
        />

        {message === null ? null : (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {message}
          </p>
        )}

        {data !== null && data.repository !== null && milestone === null ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No open milestone {number} in {data.repository}. It may have closed since the last sync.
          </p>
        ) : null}

        {data === null || milestone === null ? null : (
          <>
            <p className="mt-2 text-sm">
              {(() => {
                const due = dueWords(milestone.due, now);
                const text = due.text.charAt(0).toUpperCase() + due.text.slice(1);
                return <span className={DUE_CLASS[due.tone]}>{text}.</span>;
              })()}{" "}
              <span className="tabular-nums">
                <span className="font-semibold">{milestone.open}</span> open, {milestone.closed} closed.
              </span>{" "}
              <span className="text-muted-foreground">Over {periodLabel}: </span>
              <AddedClosed added={sum(milestone.added)} closed={sum(milestone.closedIn)} />
              <span className="text-muted-foreground">. </span>
              <a href={milestone.url} target="_blank" rel="noreferrer" className="text-muted-foreground underline hover:text-foreground">
                Open on GitHub
              </a>
            </p>

            <Strip data={data} />

            <div className="mt-4">
              <Panel title="Issues in it, and closed" note="since it was created">
                <History history={data.history} due={milestone.due} periodStart={periodStart} periodLabel={periodLabel} />
              </Panel>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-medium">Open issues, by where they stand</h3>
              {data.open.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing open.</p>
              ) : (
                STANDINGS.map((standing) => {
                  const rows = data.open.filter((issue) => issue.standing === standing.key);
                  if (rows.length === 0) return null;
                  return (
                    <div key={standing.key} className="mt-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: standing.color }} />
                        <span className="font-medium">{standing.label}</span>
                        <span className="tabular-nums text-muted-foreground">{rows.length}</span>
                        <span className="text-muted-foreground">· {standing.note}</span>
                      </div>
                      <ul className="mt-1 divide-y divide-border rounded-lg border border-border bg-card text-sm">
                        {rows.map((issue) => {
                          const fresh = issue.addedAt >= periodStart;
                          const added = `added ${ago(issue.addedAt, now)}`;
                          return (
                            <ItemRow
                              key={issue.number}
                              number={issue.number}
                              title={issue.title}
                              url={issue.url}
                              assignees={issue.assignees}
                              threadId={issue.threadId}
                              onThread={() =>
                                onThread(
                                  { kind: "issue", number: issue.number, title: issue.title, url: issue.url, meta: `${standing.label} in ${milestone.title}` },
                                  issue.threadId,
                                )
                              }
                              facts={<span style={fresh ? { color: MILESTONE_COLORS.added } : undefined}>{added}</span>}
                            />
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>

            {data.closed.length === 0 ? null : (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowClosed((open) => !open)}
                  aria-expanded={showClosed}
                  className="cursor-pointer text-sm font-medium hover:underline"
                >
                  Closed <span className="font-normal tabular-nums text-muted-foreground">{data.closed.length}</span>
                  <span aria-hidden className="ml-1 text-muted-foreground">
                    {showClosed ? "⌄" : "›"}
                  </span>
                </button>
                {showClosed ? (
                  <ul className="mt-1 divide-y divide-border rounded-lg border border-border bg-card text-sm">
                    {data.closed.map((issue) => (
                      <ItemRow
                        key={issue.number}
                        number={issue.number}
                        title={issue.title}
                        url={issue.url}
                        assignees={issue.assignees}
                        threadId={issue.threadId}
                        onThread={() =>
                          onThread(
                            { kind: "issue", number: issue.number, title: issue.title, url: issue.url, meta: `closed in ${milestone.title}` },
                            issue.threadId,
                          )
                        }
                        facts={
                          <span>
                            {issue.notDone ? "closed, not done" : "closed"} {ago(issue.closedAt, now)}
                          </span>
                        }
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            {milestone.open + milestone.closed > data.open.length + data.closed.length ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                GitHub counts {milestone.open + milestone.closed - data.open.length - data.closed.length} more issues in it, last
                updated before the dashboard's two-year horizon, so they are left out of the lists and the chart.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** One bar across the page: where the open issues stand, then what has closed. */
function Strip({ data }: { data: MilestoneDetailResult }) {
  const segments = [
    ...STRIP.map((standing) => ({
      label: standing.label,
      color: standing.color,
      count: data.open.filter((issue) => issue.standing === standing.key).length,
    })),
    { label: "Closed", color: MILESTONE_COLORS.closed, count: data.closed.length },
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

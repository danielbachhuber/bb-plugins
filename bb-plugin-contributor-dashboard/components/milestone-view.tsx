// One milestone's page: when it is due and how it moved over the period, a
// strip of where its issues stand, the issues in it and closed since it was
// created, then every open issue grouped by where it stands, and the closed
// ones behind a toggle.
import { useState, type ReactNode } from "react";

import type { MilestoneDetailResult } from "@/dashboard/contract";
import type { Selection } from "@/dashboard/period";

import { ItemRow } from "@danielbachhuber/bb-plugin-component-library/item-row";
import {
  AddedClosed,
  DUE_CLASS,
  dueWords,
  MILESTONE_COLORS,
  MilestoneHistoryChart,
  STANDINGS,
  StandingStrip,
} from "@danielbachhuber/bb-plugin-component-library/milestones";
import { PageHeader } from "./page-header";
import { PeriodPicker } from "./period-picker";
import { Bone, BoneList, LoadingNote } from "./skeleton";
import type { ThreadSeed } from "./thread-seed";

const DAY = 86_400_000;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

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
  const loading = data === null && error === null;

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
          title={milestone?.title ?? (loading ? <Bone className="h-6 w-72" /> : data === null ? "" : `Milestone ${number}`)}
          loading={loading}
        />

        {loading ? (
          <div aria-busy>
            <LoadingNote what="this milestone" />
            <Bone className="mt-3 h-3.5 w-full max-w-xl" />
            <Bone className="mt-4 h-10 w-full" />
            <Bone className="mt-4 h-48 w-full" />
            <h3 className="mt-6 text-sm font-medium">Open issues, by where they stand</h3>
            <Bone className="mt-3 h-3 w-48" />
            <BoneList count={4} className="mt-1" />
          </div>
        ) : null}

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

            <StandingStrip standings={data.open.map((issue) => issue.standing)} closed={data.closed.length} />

            <div className="mt-4">
              <Panel title="Issues in it, and closed" note="since it was created">
                <MilestoneHistoryChart history={data.history} due={milestone.due} periodStart={periodStart} periodLabel={periodLabel} />
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

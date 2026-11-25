// One milestone's page: when it is due and how it moved over the period, a
// strip of where its issues stand, its history since it was created, then
// every open issue grouped by where it stands, and the closed ones behind a
// toggle. Display only: the page gives each row's thread button its handler,
// and the row contexts from component-library's item-row.
import { useState } from "react";
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

import type { MilestonePageData } from "./contract";

const DAY = 86_400_000;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function ago(at: number, now: number): string {
  const days = Math.max(0, Math.floor((now - at) / DAY));
  return days === 0 ? "today" : `${days}d ago`;
}

export function MilestonePage({
  repo,
  number,
  data,
  onBack,
  onThread,
  now = Date.now(),
  initialShowClosed = false,
}: {
  repo: string;
  number: number;
  /** Null until the read lands. */
  data: MilestonePageData | null;
  onBack: () => void;
  /** Opens the row's thread when it has one, and otherwise bb's composer under the row. */
  onThread: (issue: { number: number; title: string; url: string }, threadId: string | null) => void;
  now?: number;
  /** Opens the closed list, for stories. */
  initialShowClosed?: boolean;
}) {
  const [showClosed, setShowClosed] = useState(initialShowClosed);
  const milestone = data?.milestone ?? null;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <button type="button" onClick={onBack} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground hover:underline">
          ← Milestones
        </button>
        <h1 className="mt-1 text-lg font-semibold">{milestone?.title ?? `Milestone ${number}`}</h1>
        <div className="text-xs text-muted-foreground">{data?.repo ?? repo}</div>

        {data === null ? <p className="mt-3 text-sm text-muted-foreground">Reading this milestone…</p> : null}

        {data?.lastError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {data.lastError}
          </p>
        ) : null}

        {data !== null && milestone === null ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No open milestone {number} in {data.repo}. It may have closed since the last sync.
          </p>
        ) : null}

        {data === null || milestone === null ? null : (
          <>
            <p className="mt-3 text-sm">
              {(() => {
                const due = dueWords(milestone.due, now);
                const text = due.text.charAt(0).toUpperCase() + due.text.slice(1);
                return <span className={DUE_CLASS[due.tone]}>{text}.</span>;
              })()}{" "}
              <span className="tabular-nums">
                <span className="font-semibold">{milestone.open}</span> open, {milestone.closed} closed.
              </span>{" "}
              <span className="text-muted-foreground">Over {data.periodLabel}: </span>
              <AddedClosed added={sum(milestone.added)} closed={sum(milestone.closedIn)} />
              <span className="text-muted-foreground">. </span>
              <a href={milestone.url} target="_blank" rel="noreferrer" className="text-muted-foreground underline hover:text-foreground">
                Open on GitHub
              </a>
            </p>

            <StandingStrip standings={data.open.map((issue) => issue.standing)} closed={data.closed.length} />

            <div className="mt-4 rounded-lg border border-border bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold">Issues in it, and closed</h3>
                <span className="text-[11px] text-muted-foreground">since it was created</span>
              </div>
              <div className="mt-2">
                <MilestoneHistoryChart history={data.history} due={milestone.due} periodStart={data.periodStart} periodLabel={data.periodLabel} />
              </div>
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
                        {rows.map((issue) => (
                          <ItemRow
                            key={issue.number}
                            number={issue.number}
                            title={issue.title}
                            url={issue.url}
                            assignees={issue.assignees}
                            threadId={issue.threadId}
                            onThread={() => onThread(issue, issue.threadId)}
                            facts={
                              <span style={issue.addedAt >= data.periodStart ? { color: MILESTONE_COLORS.added } : undefined}>
                                added {ago(issue.addedAt, now)}
                              </span>
                            }
                          />
                        ))}
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
                        onThread={() => onThread(issue, issue.threadId)}
                        facts={
                          <span>
                            {issue.notDone ? "not done" : "closed"} {ago(issue.closedAt, now)}
                          </span>
                        }
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// One person's page: their own pull requests, as opened and merged lines and
// then the list of how each fared, followed by their review bars and the pull
// requests waiting on their review. Display only.
import type { PersonActivityResult } from "@/dashboard/contract";
import { selectionWords, unitOfBuckets, type Selection } from "@/dashboard/period";

import { ItemRow } from "./item-row";
import type { ThreadSeed } from "./thread-seed";
import { PeriodPicker } from "./period-picker";
import { PageHeader } from "./page-header";
import { PullRequestFlowChart } from "./flow-chart";
import { ReviewChart, ReviewLegend } from "./review-chart";

/**
 * A review that landed in 50 minutes is not "0.0d", so anything under a
 * business day reads in hours, and under an hour in minutes.
 */
function days(value: number): string {
  if (value >= 1) return `${value.toFixed(1)}d`;
  const hours = value * 24;
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.max(1, Math.round(hours * 60))}m`;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What the person did over the span, for the line under their name. */
export function summary(data: PersonActivityResult, selection: Selection): string {
  const opened = data.authorFlows.started.reduce((sum, n) => sum + n, 0);
  const given = data.activity?.givenTotal ?? 0;
  return `Opened ${count(opened, "pull request", "pull requests")} and gave ${count(given, "review", "reviews")} over ${selectionWords(selection)}`;
}

function ago(iso: string, now: number): string {
  const days = Math.round((now - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const STATES: Record<"OPEN" | "CLOSED" | "MERGED", { label: string; className: string }> = {
  OPEN: { label: "Open", className: "text-[#1baf7a] dark:text-[#199e70]" },
  MERGED: { label: "Merged", className: "text-[#9b6cbf]" },
  CLOSED: { label: "Closed", className: "text-muted-foreground" },
};

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

export function PersonView({
  login,
  selection,
  onSelect,
  data,
  error,
  onBack,
  onOpenPerson,
  onAuthoredPage,
  onThread,
  now = Date.now(),
}: {
  login: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  data: PersonActivityResult | null;
  error: string | null;
  onBack: () => void;
  /** Switches to another person's page. */
  onOpenPerson: (login: string) => void;
  /** Shows another page of their pull requests. */
  onAuthoredPage: (page: number) => void;
  /** Opens the row's thread, or the dialog that starts one. */
  onThread: (seed: ThreadSeed, threadId: string | null) => void;
  now?: number;
}) {
  const message = error ?? data?.sync.error ?? null;
  const profile = data?.repository ? `https://github.com/${login}` : null;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <PageHeader
          repository={data?.repository ?? null}
          onHome={onBack}
          everyone={data?.everyone ?? []}
          current={login}
          onOpenPerson={onOpenPerson}
          period={<PeriodPicker selection={selection} onSelect={onSelect} />}
          title={login}
          subtitle={
            data === null ? null : (
              <>
                {summary(data, selection)}
                {profile === null ? null : (
                  <>
                    {" · "}
                    <a href={profile} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                      GitHub profile ↗
                    </a>
                  </>
                )}
              </>
            )
          }
        />

        {message === null ? null : (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {message}
          </p>
        )}

        {data === null ? null : (
          <>
            <section className="mt-6" aria-labelledby="person-pull-requests">
              <h2 id="person-pull-requests" className="text-base font-semibold">
                Pull requests
              </h2>
              {data.authorFlows.started.every((count) => count === 0) &&
              data.authorFlows.finished.every((count) => count === 0) ? (
                <p className="mt-3 text-sm text-muted-foreground">No pull requests opened or merged in this period.</p>
              ) : (
                <div className="mt-3">
                  <PullRequestFlowChart
                    title={`${login}'s pull requests`}
                    flows={data.authorFlows}
                    buckets={data.buckets}
                    unit={unitOfBuckets(data.buckets)}
                  />
                </div>
              )}
            </section>

            <section className="mt-8" aria-labelledby="person-authored">
              <h2 id="person-authored" className="text-base font-semibold">
                Their pull requests
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                  {data.authoredPaging.total}
                </span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Business days from ready for review. Weekends do not count.
              </p>
              {data.authored.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No pull requests in this period.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
                  {data.authored.map((row) => (
                    <ItemRow
                      key={row.number}
                      number={row.number}
                      title={row.title}
                      url={row.url}
                      threadId={row.threadId}
                      onThread={() => onThread({ kind: "pull", number: row.number, title: row.title, url: row.url, meta: STATES[row.state].label }, row.threadId)}
                      facts={
                        <span>
                          <span className={STATES[row.state].className}>{row.isDraft ? "Draft" : STATES[row.state].label}</span>
                          {" · "}
                          {row.firstReviewDays === null ? "no review" : `first review ${days(row.firstReviewDays)}`}
                          {row.followUps === 0 ? "" : ` · ${row.followUps} follow-up${row.followUps === 1 ? "" : "s"}`}
                          {row.mergeDays !== null ? ` · merged in ${days(row.mergeDays)}` : ""}
                          {row.waitingDays !== null ? ` · open ${days(row.waitingDays)}` : ""}
                        </span>
                      }
                    />
                  ))}
                </ul>
              )}
              {data.authoredPaging.pages < 2 ? null : (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {data.authoredPaging.from}–{data.authoredPaging.to} of {data.authoredPaging.total}
                  </span>
                  <span className="flex items-center gap-1">
                    <PageButton
                      label="Previous"
                      onClick={() => onAuthoredPage(data.authoredPaging.page - 1)}
                      disabled={data.authoredPaging.page === 0}
                    />
                    <PageButton
                      label="Next"
                      onClick={() => onAuthoredPage(data.authoredPaging.page + 1)}
                      disabled={data.authoredPaging.page >= data.authoredPaging.pages - 1}
                    />
                  </span>
                </div>
              )}
            </section>

            <section className="mt-10" aria-labelledby="person-reviews">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="person-reviews" className="text-base font-semibold">
                  Reviews
                </h2>
                <ReviewLegend unit={unitOfBuckets(data.buckets)} />
              </div>
              {data.activity === null ? (
                <p className="mt-3 text-sm text-muted-foreground">No review requests or reviews in this period.</p>
              ) : (
                <div className="mt-3">
                  <ReviewChart
                    login={login}
                    requested={data.activity.requested}
                    given={data.activity.given}
                    buckets={data.buckets}
                    unit={unitOfBuckets(data.buckets)}
                    now={now}
                  />
                </div>
              )}
            </section>

            <section className="mt-8" aria-labelledby="person-awaiting">
              <h2 id="person-awaiting" className="text-base font-semibold">
                Waiting on their review
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{data.awaiting.length}</span>
              </h2>
              {data.awaiting.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing is waiting on a review from them.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
                  {data.awaiting.map((row) => (
                    <ItemRow
                      key={row.number}
                      number={row.number}
                      title={row.title}
                      url={row.url}
                      assignees={row.assignees}
                      threadId={row.threadId}
                      onThread={() => onThread({ kind: "pull", number: row.number, title: row.title, url: row.url, meta: `${days(row.waitingDays)} waiting` }, row.threadId)}
                      facts={
                        <span>
                          {row.author === null ? "" : `${row.author} · `}
                          asked {ago(row.requestedAt, now)} · {days(row.waitingDays)} waiting
                        </span>
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

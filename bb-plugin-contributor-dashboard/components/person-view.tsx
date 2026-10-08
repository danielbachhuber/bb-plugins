// One person's page: their review lines full width, the pull requests waiting
// on their review, and how their own pull requests fared. Display only.
import type { PersonActivityResult } from "@/dashboard/contract";
import { PERIODS, type PeriodId } from "@/dashboard/period";
import { reviewerRow } from "@/review/velocity";

import { PersonChart, REVIEW_SERIES, SeriesLegend } from "./person-chart";
import { Segmented } from "./segmented";

/**
 * A review that landed in 50 minutes is not "0.0d", so anything under a
 * business day reads in hours, and under an hour in minutes.
 */
function days(value: number): string {
  if (value >= 1) return `${value.toFixed(1)}d`;
  const hours = value * 24;
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.max(1, Math.round(hours * 60))}m`;
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

function PullRequestLink({ number, title, url }: { number: number; title: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="truncate hover:underline">
      <span className="tabular-nums text-muted-foreground">#{number}</span> {title}
    </a>
  );
}

export function PersonView({
  login,
  period,
  onPeriod,
  data,
  error,
  onBack,
  onAuthoredPage,
  now = Date.now(),
}: {
  login: string;
  period: PeriodId;
  onPeriod: (period: PeriodId) => void;
  data: PersonActivityResult | null;
  error: string | null;
  onBack: () => void;
  /** Shows another page of their pull requests. */
  onAuthoredPage: (page: number) => void;
  now?: number;
}) {
  const message = error ?? data?.sync.error ?? null;
  const profile = data?.repository ? `https://github.com/${login}` : null;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={onBack}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              ← All people
            </button>
            <h1 className="text-sm font-medium">
              {profile === null ? (
                login
              ) : (
                <a href={profile} target="_blank" rel="noreferrer" className="hover:underline">
                  {login}
                </a>
              )}
            </h1>
            {data?.repository ? <span className="text-xs text-muted-foreground">{data.repository}</span> : null}
          </div>
          <Segmented label="Period" options={PERIODS} value={period} onChange={onPeriod} />
        </div>

        {message === null ? null : (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {message}
          </p>
        )}

        {data === null ? null : (
          <>
            <section className="mt-6" aria-labelledby="person-reviews">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="person-reviews" className="text-base font-semibold">
                  Reviews
                </h2>
                <SeriesLegend series={REVIEW_SERIES} />
              </div>
              {data.activity === null ? (
                <p className="mt-3 text-sm text-muted-foreground">No review requests or reviews in this period.</p>
              ) : (
                <div className="mt-3">
                  <PersonChart
                    person={reviewerRow(data.activity)}
                    series={REVIEW_SERIES}
                    buckets={data.buckets}
                    max={Math.max(1, ...data.activity.requested, ...data.activity.given)}
                    unit={period === "6w" || period === "12w" ? "Week of" : ""}
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
                    <li key={row.number} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <PullRequestLink {...row} />
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {row.author === null ? "" : `${row.author} · `}
                        asked {ago(row.requestedAt, now)} · {days(row.waitingDays)} waiting
                      </span>
                    </li>
                  ))}
                </ul>
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
                    <li key={row.number} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <PullRequestLink {...row} />
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        <span className={STATES[row.state].className}>{row.isDraft ? "Draft" : STATES[row.state].label}</span>
                        {" · "}
                        {row.firstReviewDays === null ? "no review" : `first review ${days(row.firstReviewDays)}`}
                        {row.followUps === 0 ? "" : ` · ${row.followUps} follow-up${row.followUps === 1 ? "" : "s"}`}
                        {row.mergeDays !== null ? ` · merged in ${days(row.mergeDays)}` : ""}
                        {row.waitingDays !== null ? ` · open ${days(row.waitingDays)}` : ""}
                      </span>
                    </li>
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
          </>
        )}
      </div>
    </div>
  );
}

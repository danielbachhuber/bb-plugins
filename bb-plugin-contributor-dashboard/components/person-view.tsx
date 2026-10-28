// One person's page: their own pull requests, as opened and merged lines and
// then the list of how each fared, followed by their review bars and the pull
// requests waiting on their review. Display only.
import type { AuthoredQuery, PersonActivityResult } from "@/dashboard/contract";
import { selectionWords, unitOfBuckets, type Selection } from "@/dashboard/period";

import type { BatchItem } from "./batch-dialog";
import { ItemRow } from "./item-row";
import { AuthoredList, AwaitingList, days } from "./person-lists";
import type { ThreadSeed } from "./thread-seed";
import { PeriodPicker } from "./period-picker";
import { PageHeader } from "./page-header";
import { PullRequestFlowChart } from "./flow-chart";
import { ReviewChart, ReviewLegend } from "./review-chart";

const WARN = "text-[#b4530a] dark:text-[#e59a3a]";

/** A team as GitHub names it, `org/slug`, in a small outlined tag. */
export function TeamName({ organization, slug }: { organization: string | null; slug: string }) {
  return (
    <span className="mr-1 inline-flex items-center rounded border border-border px-1 text-[11px] leading-4 last:mr-0">
      {organization === null ? slug : `${organization}/${slug}`}
    </span>
  );
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What the person did over the span, for the line under their name. */
export function summary(data: PersonActivityResult, selection: Selection): string {
  const opened = data.authorFlows.started.reduce((sum, n) => sum + n, 0);
  const given = data.activity?.givenTotal ?? 0;
  return `Opened ${count(opened, "pull request", "pull requests")} and gave ${count(given, "review", "reviews")} over ${selectionWords(selection)}`;
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
  authoredQuery,
  onAuthoredQuery,
  onBatchAuthored,
  onBatch,
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
  /** How the toolbar narrows and orders their pull requests; the server applies it. */
  authoredQuery: AuthoredQuery;
  onAuthoredQuery: (next: AuthoredQuery) => void;
  /** Opens Batch over every one of their pull requests the filter matches. */
  onBatchAuthored: (heading: string) => void;
  /** Opens Batch over rows a list on the page already holds. */
  onBatch: (kind: "issue" | "pull", heading: string, rows: readonly BatchItem[]) => void;
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

            <AuthoredList
              data={data}
              query={authoredQuery}
              onQuery={onAuthoredQuery}
              onPage={onAuthoredPage}
              onBatch={onBatchAuthored}
              onThread={onThread}
            />

            <section className="mt-10" aria-labelledby="person-reviews">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="person-reviews" className="text-base font-semibold">
                  Reviews
                </h2>
                <ReviewLegend unit={unitOfBuckets(data.buckets)} split={(data.activity?.pickedUpTotal ?? 0) > 0} />
              </div>
              {data.activity === null ? (
                <p className="mt-3 text-sm text-muted-foreground">No review requests or reviews in this period.</p>
              ) : (
                <div className="mt-3">
                  <ReviewChart
                    login={login}
                    requested={data.activity.requested}
                    pickedUp={data.activity.pickedUpTotal > 0 ? data.activity.pickedUp : undefined}
                    given={data.activity.given}
                    buckets={data.buckets}
                    unit={unitOfBuckets(data.buckets)}
                    now={now}
                  />
                </div>
              )}
            </section>

            <AwaitingList rows={data.awaiting} onBatch={(heading, rows) => onBatch("pull", heading, rows)} onThread={onThread} now={now} />

            <section className="mt-8" aria-labelledby="person-team-awaiting">
              <h2 id="person-team-awaiting" className="text-base font-semibold">
                Waiting on their team
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">{data.teamAwaiting.length}</span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Asked of a team they are in, and nobody has reviewed since. Their own pull requests are left out. Longest
                wait first.
              </p>
              {data.teamAwaiting.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing is waiting on their teams.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
                  {data.teamAwaiting.map((row) => (
                    <ItemRow
                      key={row.number}
                      number={row.number}
                      title={row.title}
                      url={row.url}
                      assignees={row.assignees}
                      threadId={row.threadId}
                      onThread={() => onThread({ kind: "pull", number: row.number, title: row.title, url: row.url, meta: `${days(row.waitingDays)} waiting on ${row.teams.join(", ")}` }, row.threadId)}
                      facts={
                        <span>
                          {row.author === null ? "" : `${row.author} · `}
                          {row.teams.map((slug) => (
                            <TeamName key={slug} organization={data.organization} slug={slug} />
                          ))}
                          {row.named.length === 0 ? (
                            <span className={WARN}> · no one named</span>
                          ) : (
                            ` and ${row.named.join(", ")}`
                          )}
                          {" · "}
                          <span className={row.waitingDays > 3 ? "text-destructive" : ""}>{days(row.waitingDays)} waiting</span>
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

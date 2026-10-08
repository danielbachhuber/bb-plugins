// The Contributor Dashboard page: the repository, period picker, and sync line
// every section shares, then each section. Display only; app.tsx loads the data.
import type { PeopleActivityResult, StageKey, SyncStatus } from "@/dashboard/contract";
import { PERIODS, PERIOD_LENGTHS, type PeriodId } from "@/dashboard/period";

import { authorRow, reviewerRow } from "@/review/velocity";

import { AUTHOR_SERIES, REVIEW_SERIES } from "./person-chart";
import { StageFlowSection } from "./stage-flow";
import { Segmented } from "./segmented";
import { VelocitySection } from "./velocity-section";

/**
 * What the first sync is doing, while it is still reaching back two years.
 * Null once it has finished: from then on the header's line is enough.
 */
function backfillLine(sync: SyncStatus): string | null {
  if (sync.backfillDone) return null;
  const count = `${sync.pullRequests.toLocaleString("en-US")} pull requests and ${sync.issues.toLocaleString("en-US")} issues`;
  return sync.running
    ? `First sync: ${count} so far. Counts fill in as it reaches back two years.`
    : `First sync paused at ${count}. It resumes on the next sync.`;
}

export function DashboardView({
  period,
  onPeriod,
  data,
  error,
  onOpenPerson,
  onOpenStage,
  now = Date.now(),
  initialHovered,
}: {
  period: PeriodId;
  onPeriod: (period: PeriodId) => void;
  data: PeopleActivityResult | null;
  /** Loading the page failed. */
  error: string | null;
  onOpenPerson: (login: string) => void;
  onOpenStage: (stage: StageKey) => void;
  now?: number;
  /** A bucket to show hovered on the first person's chart, for stories. */
  initialHovered?: number;
}) {
  const message = error ?? data?.sync.error ?? null;
  const backfill = data === null ? null : backfillLine(data.sync);

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {data?.repository ? <span className="text-sm font-medium text-foreground">{data.repository}</span> : null}
            {backfill === null ? null : <span role="status">{backfill}</span>}
          </div>
          <Segmented label="Period" options={PERIODS} value={period} onChange={onPeriod} />
        </div>

        {data !== null && data.repository === null ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-medium">Choose a repository to chart</p>
            <p className="mt-1 text-muted-foreground">
              Set it with{" "}
              <code className="rounded bg-muted px-1">bb plugin config contributor-dashboard set repository owner/name</code>,
              then reload the plugin.
            </p>
          </div>
        ) : null}

        {message === null ? null : (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {message}
          </p>
        )}

        {data === null || data.repository === null ? null : (
          <StageFlowSection stages={data.stages} periodLabel={PERIOD_LENGTHS[period]} onOpenStage={onOpenStage} />
        )}

        {data === null || data.repository === null ? null : (
          <>
            <VelocitySection
              id="pr-velocity"
              heading="PR velocity"
              title="Pull requests per person"
              note="opened by each person, and merged"
              rows={data.authors.map(authorRow)}
              series={AUTHOR_SERIES}
              buckets={data.buckets}
              period={period}
              emptyNote={
                data.sync.running
                  ? "Nothing in this period yet. The sync is still running."
                  : "No pull requests opened or merged in this period."
              }
              initialHovered={initialHovered}
              onOpenPerson={onOpenPerson}
            />
            <VelocitySection
              id="review-velocity"
              heading="Review velocity"
              title="Reviews per person"
              note="requested of each person, and given by them"
              rows={data.people.map(reviewerRow)}
              series={REVIEW_SERIES}
              buckets={data.buckets}
              period={period}
              emptyNote={
                data.sync.running
                  ? "Nothing in this period yet. The sync is still running."
                  : "No review requests or reviews in this period."
              }
              onOpenPerson={onOpenPerson}
            />
          </>
        )}
      </div>
    </div>
  );
}

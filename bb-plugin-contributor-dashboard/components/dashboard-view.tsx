// The Contributor Dashboard page: the repository, period picker, and sync line
// every section shares, then the overview's flow diagram and a section each for
// issues, pull requests, and releases. Display only; app.tsx loads the data.
import type { ReactNode } from "react";

import type { PeopleActivityResult, StageKey, StageSummary, SyncStatus } from "@/dashboard/contract";
import { selectionWords, unitOfBuckets, type Selection } from "@/dashboard/period";

import { authorRow, reviewerRow } from "@/review/velocity";

import { FlowDiagram } from "./flow-diagram";
import { AUTHOR_SERIES, REVIEW_SERIES } from "./person-chart";
import { PeriodPicker } from "./period-picker";
import { ReleasesSection } from "./releases-section";
import { StageTable } from "./stage-flow";
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

/**
 * Implement change is timed from a draft to ready for review, so it measures
 * only the pull requests that open as drafts. Left off the page until it has
 * a measure that covers the rest.
 */
const DRAWN = (stage: StageSummary) => stage.key !== "implement";

/** A top-level section: a heading over everything the section holds. */
function Section({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-border pt-4" aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      {children}
    </section>
  );
}

export function DashboardView({
  selection,
  onSelect,
  data,
  error,
  onOpenPerson,
  onOpenStage,
  now = Date.now(),
  initialHovered,
}: {
  selection: Selection;
  onSelect: (selection: Selection) => void;
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {data?.repository ? <span className="text-sm font-medium text-foreground">{data.repository}</span> : null}
          </div>
          <PeriodPicker selection={selection} onSelect={onSelect} />
        </div>

        {/* Below the row rather than in it: the sentence is long enough to push
            the span picker onto a line of its own. */}
        {backfill === null ? null : (
          <p role="status" className="mt-1 text-xs text-muted-foreground">
            {backfill}
          </p>
        )}

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
          <>
            <FlowDiagram
              flow={data.flow}
              stages={data.stages}
              periodLabel={selectionWords(selection)}
              onOpenStage={onOpenStage}
            />

            <Section id="issues" title="Issues" note="Identify, and the first step of Execute">
              <h3 className="mt-4 text-sm font-medium">
                How long each step takes
                <span className="ml-2 font-normal text-muted-foreground">
                  business days, over {selectionWords(selection)}
                </span>
              </h3>
              <StageTable
                stages={data.stages.filter((stage) => stage.source === "issue" && DRAWN(stage))}
                unit={unitOfBuckets(data.buckets)}
                onOpenStage={onOpenStage}
              />
            </Section>

            <Section id="pull-requests" title="Pull requests" note="the rest of Execute, Verify, and Release">
              <h3 className="mt-4 text-sm font-medium">
                How long each step takes
                <span className="ml-2 font-normal text-muted-foreground">
                  business days, over {selectionWords(selection)}
                </span>
              </h3>
              <StageTable
                stages={data.stages.filter((stage) => stage.source === "pullRequest" && DRAWN(stage))}
                unit={unitOfBuckets(data.buckets)}
                onOpenStage={onOpenStage}
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Half pass a step within its median; a quarter take longer than its p75, a tenth longer than its p90.
                Open a step to see what is in it.
              </p>
              <VelocitySection
                id="pr-velocity"
                heading="PR velocity"
                title="Pull requests per person"
                note="opened by each person, and merged"
                rows={data.authors.map(authorRow)}
                series={AUTHOR_SERIES}
                buckets={data.buckets}
                unit={unitOfBuckets(data.buckets)}
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
                unit={unitOfBuckets(data.buckets)}
                emptyNote={
                  data.sync.running
                    ? "Nothing in this period yet. The sync is still running."
                    : "No review requests or reviews in this period."
                }
                onOpenPerson={onOpenPerson}
              />
            </Section>

            <ReleasesSection
              releases={data.releases}
              periodLabel={selectionWords(selection)}
              onOpenPerson={onOpenPerson}
            />
          </>
        )}
      </div>
    </div>
  );
}

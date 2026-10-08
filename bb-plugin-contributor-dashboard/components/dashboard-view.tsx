// The Contributor Dashboard page: the repository, period picker, and sync line
// every section shares, then each section. Display only; app.tsx loads the data.
import type { PeopleActivityResult, StageKey, SyncStatus } from "@/dashboard/contract";
import { PERIODS, PERIOD_LENGTHS, type PeriodId } from "@/dashboard/period";

import { ReviewVelocitySection } from "./review-velocity-section";
import { StageFlowSection } from "./stage-flow";
import { Segmented } from "./segmented";

function ago(at: number, now: number): string {
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function syncLine(sync: SyncStatus, now: number): string {
  const count = sync.pullRequests.toLocaleString("en-US");
  if (!sync.backfillDone) {
    return sync.running
      ? `First sync: ${count} pull requests so far. Counts fill in as it reaches back two years.`
      : `First sync paused at ${count} pull requests. It resumes on the next sync.`;
  }
  if (sync.running) return "Syncing…";
  return sync.syncedAt === null ? "Not synced yet" : `Synced ${ago(sync.syncedAt, now)}`;
}

export function DashboardView({
  period,
  onPeriod,
  data,
  error,
  onSync,
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
  onSync: () => void;
  onOpenPerson: (login: string) => void;
  onOpenStage: (stage: StageKey) => void;
  now?: number;
  /** A bucket to show hovered on the first person's chart, for stories. */
  initialHovered?: number;
}) {
  const message = error ?? data?.sync.error ?? null;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {data?.repository ? <span className="text-sm font-medium text-foreground">{data.repository}</span> : null}
            {data === null || data.repository === null ? null : (
              <span className="inline-flex items-center gap-2">
                <span role="status">{syncLine(data.sync, now)}</span>
                <button
                  type="button"
                  onClick={onSync}
                  disabled={data.sync.running}
                  className="cursor-pointer rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted disabled:cursor-default disabled:opacity-50"
                >
                  Sync
                </button>
              </span>
            )}
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
          <ReviewVelocitySection
            buckets={data.buckets}
            people={data.people}
            period={period}
            syncing={data.sync.running}
            initialHovered={initialHovered}
            onOpenPerson={onOpenPerson}
          />
        )}
      </div>
    </div>
  );
}

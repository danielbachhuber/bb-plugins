// The Review Velocity page: period picker, sync line, and one small multiple
// per person. Display only; app.tsx loads the data.
import type { PeopleActivityResult, SyncStatus } from "@/velocity/contract";
import { PERIODS, type PeriodId } from "@/velocity/period";

import { PersonChart, SeriesLegend } from "./person-chart";
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

export function PeopleView({
  period,
  onPeriod,
  data,
  error,
  onSync,
  now = Date.now(),
  initialHovered,
}: {
  period: PeriodId;
  onPeriod: (period: PeriodId) => void;
  data: PeopleActivityResult | null;
  /** Loading the page failed. */
  error: string | null;
  onSync: () => void;
  now?: number;
  /** A bucket to show hovered on the first card, for stories. */
  initialHovered?: number;
}) {
  const max = Math.max(0, ...(data?.people ?? []).flatMap((person) => [...person.requested, ...person.given]));
  const unit = period === "6w" || period === "12w" ? "Week of" : "";
  const message = error ?? data?.sync.error ?? null;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold">Reviews per person</h1>
            <p className="text-xs text-muted-foreground">
              {data?.repository ? `${data.repository} · ` : ""}reviews requested of each person and reviews they gave
            </p>
          </div>
          <Segmented label="Period" options={PERIODS} value={period} onChange={onPeriod} />
        </div>

        {data !== null && data.repository === null ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-medium">Choose a repository to chart</p>
            <p className="mt-1 text-muted-foreground">
              Set it with <code className="rounded bg-muted px-1">bb plugin config review-velocity set repository owner/name</code>,
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <SeriesLegend />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span role="status">{syncLine(data.sync, now)}</span>
                <button
                  type="button"
                  onClick={onSync}
                  disabled={data.sync.running}
                  className="cursor-pointer rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted disabled:cursor-default disabled:opacity-50"
                >
                  Sync
                </button>
              </div>
            </div>

            {data.people.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                {data.sync.running ? "Nothing in this period yet. The sync is still running." : "No review requests or reviews in this period."}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {data.people.map((person, index) => (
                  <PersonChart
                    key={person.login}
                    person={person}
                    buckets={data.buckets}
                    max={max}
                    unit={unit}
                    initialHovered={index === 0 ? initialHovered : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

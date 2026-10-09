// One stage's page: what it measures, how long it took and how long the queue
// has waited, what is in it now, and how the two move across the period.
import type { StageDetailResult } from "@/dashboard/contract";
import { unitOfBuckets, type Selection } from "@/dashboard/period";

import { days } from "./stage-flow";
import { PeriodPicker } from "./period-picker";

const BAR = "bg-[#2a78d6] dark:bg-[#3987e5]";
const DONE = "bg-[#1baf7a] dark:bg-[#199e70]";

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
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

function Bars({ bars }: { bars: ReadonlyArray<{ label: string; count: number; late?: boolean }> }) {
  const high = Math.max(1, ...bars.map((bar) => bar.count));
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">
        {bars.map((bar) => (
          <span key={bar.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">{bar.count}</span>
            <span
              className={`w-full rounded-sm ${bar.late === true ? "bg-destructive" : bar.late === false ? DONE : BAR}`}
              style={{ height: (bar.count / high) * 70 }}
            />
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {bars.map((bar) => (
          <span key={bar.label} className="flex-1 text-center text-[10px] text-muted-foreground">
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** How many left the stage each bucket, with the median and p90 drawn over them. */
function PerBucket({ series }: { series: StageDetailResult["stage"]["series"] }) {
  const height = 96;
  const highCount = Math.max(1, ...series.map((bucket) => bucket.count));
  const highDays = Math.max(0.5, ...series.map((bucket) => bucket.p90));
  const x = (index: number) => ((index + 0.5) / series.length) * 100;
  const y = (value: number) => height - (value / highDays) * (height - 26);
  const line = (key: "median" | "p90") => series.map((bucket, index) => `${x(index)},${y(bucket[key])}`).join(" ");

  return (
    <div>
      <div className="relative" style={{ height }}>
        <span
          className="absolute inset-x-0 border-t border-dashed border-border"
          style={{ top: y(highDays / 2) }}
        >
          <span className="absolute -top-2 right-0 bg-card px-1 text-[9px] tabular-nums text-muted-foreground">
            {days(highDays / 2)}
          </span>
        </span>
        <div className="absolute inset-0 flex items-end gap-1.5">
          {series.map((bucket) => (
            <span key={bucket.label} className="flex flex-1 flex-col items-center justify-end">
              <span className="text-[9px] tabular-nums text-muted-foreground">{bucket.count}</span>
              <span
                className="w-full rounded-sm bg-muted"
                style={{ height: (bucket.count / highCount) * (height - 26) }}
              />
            </span>
          ))}
        </div>
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
          <polyline
            points={line("p90")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-destructive"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={line("median")}
            fill="none"
            stroke="#3987e5"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="mt-1 flex gap-1.5">
        {series.map((bucket) => (
          <span key={bucket.label} className="flex-1 text-center text-[10px] text-muted-foreground">
            {bucket.label}
          </span>
        ))}
      </div>
    </div>
  );
}

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

/** The stage's line starts a sentence here, so it starts with a capital. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ago(iso: string, now: number): string {
  const elapsed = Math.round((now - Date.parse(iso)) / 86_400_000);
  if (elapsed < 1) return "today";
  if (elapsed === 1) return "yesterday";
  return elapsed < 14 ? `${elapsed} days ago` : `${Math.round(elapsed / 7)} weeks ago`;
}

export function StageView({
  selection,
  onSelect,
  data,
  error,
  onBack,
  onWaitingPage,
  periodLabel,
  now = Date.now(),
}: {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  data: StageDetailResult | null;
  error: string | null;
  onBack: () => void;
  onWaitingPage: (page: number) => void;
  periodLabel: string;
  now?: number;
}) {
  const message = error ?? data?.sync.error ?? null;
  const unit = unitOfBuckets(data?.buckets ?? []);
  const stage = data === null ? null : data.stage;
  const paging = data === null ? null : data.waitingPaging;

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
              ← All stages
            </button>
            <h1 className="text-sm font-medium">{stage?.label ?? ""}</h1>
            {data?.repository ? <span className="text-xs text-muted-foreground">{data.repository}</span> : null}
          </div>
          <PeriodPicker selection={selection} onSelect={onSelect} />
        </div>

        {message === null ? null : (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {message}
          </p>
        )}

        {stage === null || data === null || paging === null ? null : (
          <>
            <p className="mt-2 text-xs text-muted-foreground">
              {sentence(stage.measures)}. <span className="tabular-nums text-foreground">{stage.left}</span> left this stage over{" "}
              {periodLabel}, <span className="tabular-nums text-foreground">{stage.waiting}</span> still in it. Half
              within {days(stage.median)}; 1 in 4 over {days(stage.p75)}, 1 in 10 over {days(stage.p90)}.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Panel title="How long it took" note={`${stage.left} left · ${periodLabel}`}>
                <Bars bars={stage.spread} />
              </Panel>
              <Panel title="How long the queue has waited" note={`${stage.waiting} in it now`}>
                <Bars bars={stage.queue} />
              </Panel>
            </div>

            <h2 className="mt-6 text-base font-semibold">
              In this stage now
              <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                {paging.total}
              </span>
            </h2>
            {paging.total === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing is in this stage.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
                {stage.waitingNow.map((span) => (
                  <li key={span.number} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <a href={span.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                      <span className="tabular-nums text-muted-foreground">#{span.number}</span> {span.title}
                    </a>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {span.author === null ? "" : `${span.author} · `}
                      since {ago(span.startedAt, now)} ·{" "}
                      <span className={span.days > 3 ? "text-destructive" : ""}>{days(span.days)} waiting</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {paging.pages < 2 ? null : (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {paging.from}–{paging.to} of {paging.total}
                </span>
                <span className="flex items-center gap-1">
                  <PageButton
                    label="Previous"
                    onClick={() => onWaitingPage(paging.page - 1)}
                    disabled={paging.page === 0}
                  />
                  <PageButton
                    label="Next"
                    onClick={() => onWaitingPage(paging.page + 1)}
                    disabled={paging.page >= paging.pages - 1}
                  />
                </span>
              </div>
            )}

            <h2 className="mt-6 text-base font-semibold">Each {unit}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Bars are how many left the stage. The blue line is that {unit}'s median, the red line its p90.
            </p>
            <div className="mt-2 rounded-lg border border-border bg-card p-3">
              <PerBucket series={stage.series} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

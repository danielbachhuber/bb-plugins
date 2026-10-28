// One stage's page: what it measures, how long it took and how long the queue
// has waited, what is in it now, and how the two move across the period.
import type { StageDetailResult, WaitingQuery } from "@/dashboard/contract";
import { unitOfBuckets, type Selection } from "@/dashboard/period";

import { days } from "./stage-flow";
import { ItemRow } from "./item-row";
import type { ThreadSeed } from "./thread-seed";
import { PageHeader } from "./page-header";
import { PeriodPicker } from "./period-picker";
import { BatchButton, PeopleMenu, SortMenu, type SortOption } from "./list-toolbar";

const BAR = "bg-[#2a78d6] dark:bg-[#3987e5]";
const DONE = "bg-[#1baf7a] dark:bg-[#199e70]";
/** Code review asked of a team only, with no one named: the overview's amber. */
const TEAM = "bg-[#d9820a]";
const WARN = "text-[#b4530a] dark:text-[#e59a3a]";

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

/** A column per band; `team`, when given, is the part of the column drawn amber on top. */
function Bars({ bars }: { bars: ReadonlyArray<{ label: string; count: number; late?: boolean; team?: number }> }) {
  const high = Math.max(1, ...bars.map((bar) => bar.count));
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">
        {bars.map((bar) => (
          <span key={bar.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">{bar.count}</span>
            <span className="flex w-full flex-col overflow-hidden rounded-sm">
              {(bar.team ?? 0) === 0 ? null : (
                <span className={`w-full ${TEAM}`} style={{ height: ((bar.team ?? 0) / high) * 70 }} />
              )}
              <span
                className={`w-full ${bar.late === true ? "bg-destructive" : bar.late === false ? DONE : BAR}`}
                style={{ height: ((bar.count - (bar.team ?? 0)) / high) * 70 }}
              />
            </span>
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

const WAITING_SORTS: SortOption<WaitingQuery["sort"]>[] = [
  { key: "wait", label: "Wait", asc: "Shortest", desc: "Longest", start: "desc" },
  { key: "author", label: "Author", asc: "A–Z", desc: "Z–A", start: "asc" },
];

/** What the queue's filters keep, as a phrase for Batch: "Waiting in Review by mona, nobody assigned". */
export function describeWaiting(label: string, query: WaitingQuery): string {
  const by = query.author === null ? "" : ` by ${query.author}`;
  const assigned = query.assignee === null ? "" : query.assignee === "" ? ", nobody assigned" : `, assigned to ${query.assignee}`;
  const asked = query.askedOf === null ? "" : query.askedOf === "team" ? ", asked of a team only" : ", a person named";
  return `Waiting in ${label}${asked}${by}${assigned}`;
}

/** Who a Code review row is still waiting on: its teams, and who is named, or that no one is. */
function Asked({ span, organization }: { span: StageDetailResult["stage"]["waitingNow"][number]; organization: string | null }) {
  const teams = span.teams ?? [];
  const named = span.named ?? [];
  return (
    <>
      {teams.map((slug) => (
        <span key={slug} className="mr-1 inline-flex items-center rounded border border-border px-1 text-[11px] leading-4">
          {organization === null ? slug : `${organization}/${slug}`}
        </span>
      ))}
      {named.length > 0 ? (
        `${teams.length > 0 ? "and " : "asked "}${named.join(", ")} · `
      ) : span.askedOf === "team" ? (
        <>
          {teams.length > 0 ? "· " : ""}
          <span className={WARN}>no one named</span> ·{" "}
        </>
      ) : teams.length > 0 ? (
        "· "
      ) : null}
    </>
  );
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
  onOpenPerson,
  onWaitingPage,
  periodLabel,
  onThread,
  waitingQuery,
  onWaitingQuery,
  onBatch,
  now = Date.now(),
}: {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  data: StageDetailResult | null;
  error: string | null;
  onBack: () => void;
  onOpenPerson: (login: string) => void;
  onWaitingPage: (page: number) => void;
  periodLabel: string;
  /** Opens the row's thread, or the dialog that starts one. */
  onThread: (seed: ThreadSeed, threadId: string | null) => void;
  /** How the toolbar narrows and orders the queue; the server applies it. */
  waitingQuery: WaitingQuery;
  onWaitingQuery: (next: WaitingQuery) => void;
  /** Opens Batch over everything in the queue the filters match. */
  onBatch: (kind: "issue" | "pull", heading: string) => void;
  now?: number;
}) {
  const message = error ?? data?.sync.error ?? null;
  const unit = unitOfBuckets(data?.buckets ?? []);
  const stage = data === null ? null : data.stage;
  const paging = data === null ? null : data.waitingPaging;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <PageHeader
          repository={data?.repository ?? null}
          onHome={onBack}
          everyone={data?.everyone ?? []}
          onOpenPerson={onOpenPerson}
          period={<PeriodPicker selection={selection} onSelect={onSelect} />}
          title={stage?.label ?? ""}
        />

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
              {stage.byAsked === undefined ? null : (
                <>
                  {" "}Asked of a team only: half within {days(stage.byAsked.team.median)}, 1 in 10 over{" "}
                  {days(stage.byAsked.team.p90)}. Asked of a person: half within {days(stage.byAsked.person.median)}, 1
                  in 10 over {days(stage.byAsked.person.p90)}.
                </>
              )}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Panel title="How long it took" note={`${stage.left} left · ${periodLabel}`}>
                <Bars bars={stage.spread} />
              </Panel>
              <Panel
                title="How long the queue has waited"
                note={
                  stage.byAsked === undefined
                    ? `${stage.waiting} in it now`
                    : `${stage.waiting} in it now · ${stage.byAsked.team.waiting} on a team only`
                }
              >
                <Bars bars={stage.queue} />
                {stage.byAsked === undefined ? null : (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className={`inline-block h-2 w-2 rounded-sm ${TEAM}`} />
                    asked of a team only, no one named
                  </p>
                )}
              </Panel>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                In this stage now
                <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                  {paging.total === stage.waiting ? paging.total : `${paging.total} of ${stage.waiting}`}
                </span>
              </h2>
              {stage.waiting === 0 ? null : (
                <span className="flex flex-wrap items-center gap-1.5">
                  <SortMenu
                    options={WAITING_SORTS}
                    sort={waitingQuery.sort}
                    direction={waitingQuery.direction}
                    onSort={(sort, direction) => onWaitingQuery({ ...waitingQuery, sort, direction })}
                  />
                  <PeopleMenu
                    label="Author"
                    value={waitingQuery.author}
                    counts={data.waitingFacets.authors}
                    onPick={(author) => onWaitingQuery({ ...waitingQuery, author })}
                  />
                  <PeopleMenu
                    label="Assigned"
                    value={waitingQuery.assignee}
                    counts={data.waitingFacets.assignees}
                    nobody={data.waitingFacets.nobody}
                    onPick={(assignee) => onWaitingQuery({ ...waitingQuery, assignee })}
                  />
                  <BatchButton
                    count={paging.total}
                    onBatch={() => onBatch(stage.source === "issue" ? "issue" : "pull", describeWaiting(stage.label, waitingQuery))}
                  />
                </span>
              )}
            </div>
            {stage.byAsked === undefined || stage.waiting === 0 ? null : (
              <div className="mt-2 inline-flex rounded-md border border-border p-0.5 text-xs" role="group" aria-label="Who was asked">
                {(
                  [
                    [null, "All", stage.waiting],
                    ["team", "On a team only", stage.byAsked.team.waiting],
                    ["person", "A person named", stage.byAsked.person.waiting],
                  ] as const
                ).map(([key, label, n]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={waitingQuery.askedOf === key}
                    onClick={() => onWaitingQuery({ ...waitingQuery, askedOf: key })}
                    className={`cursor-pointer rounded px-2 py-0.5 ${waitingQuery.askedOf === key ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {label}{" "}
                    <span className={`tabular-nums ${key === "team" && n > 0 ? WARN : ""}`}>{n}</span>
                  </button>
                ))}
              </div>
            )}
            {paging.total === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {stage.waiting === 0 ? "Nothing is in this stage." : "Nothing in this stage matches the filters."}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
                {stage.waitingNow.map((span) => (
                  <ItemRow
                    key={span.number}
                    number={span.number}
                    title={span.title}
                    url={span.url}
                    assignees={span.assignees}
                    threadId={span.threadId}
                    onThread={() =>
                      onThread(
                        {
                          kind: stage.source === "issue" ? "issue" : "pull",
                          number: span.number,
                          title: span.title,
                          url: span.url,
                          meta: `${days(span.days)} waiting in ${stage.label}`,
                        },
                        span.threadId,
                      )
                    }
                    facts={
                      <span>
                        {span.author === null ? "" : `${span.author} · `}
                        {span.askedOf === undefined ? null : <Asked span={span} organization={data.organization} />}
                        since {ago(span.startedAt, now)} ·{" "}
                        <span className={span.days > 3 ? "text-destructive" : ""}>{days(span.days)} waiting</span>
                      </span>
                    }
                  />
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

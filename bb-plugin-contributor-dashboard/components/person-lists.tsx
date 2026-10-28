// Two of the lists on a person's page, each with the lists' toolbar: their own
// pull requests, paged and narrowed on the server, and what is waiting on
// their review, which the page holds whole. Display only.
import type { AuthoredQuery, PersonActivityResult } from "@/dashboard/contract";
import { authoredState } from "@/review/list-query";

import type { BatchItem } from "./batch-dialog";
import { ItemRow } from "./item-row";
import { BatchButton, ChoiceMenu, PeopleMenu, SortMenu, type SortOption } from "./list-toolbar";
import { useLocalList } from "./local-list";
import type { ThreadSeed } from "./thread-seed";

/**
 * A review that landed in 50 minutes is not "0.0d", so anything under a
 * business day reads in hours, and under an hour in minutes.
 */
export function days(value: number): string {
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

export function PageButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
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

/** The heading's count: the whole list, or how many of it the filters keep. */
export function Count({ shown, total }: { shown: number; total: number }) {
  return (
    <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
      {shown === total ? total : `${shown} of ${total}`}
    </span>
  );
}

const AUTHORED_SORTS: SortOption<AuthoredQuery["sort"]>[] = [
  { key: "opened", label: "Opened", asc: "Oldest", desc: "Newest", start: "desc" },
  { key: "merged", label: "Merged", asc: "Oldest", desc: "Newest", start: "desc" },
  { key: "firstReview", label: "Time to first review", asc: "Fastest", desc: "Slowest", start: "desc" },
  { key: "mergeTime", label: "Time to merge", asc: "Fastest", desc: "Slowest", start: "desc" },
  { key: "size", label: "Size", asc: "Smallest", desc: "Biggest", start: "desc" },
];

const STATE_WORDS: Record<NonNullable<AuthoredQuery["state"]>, string> = {
  open: "Open",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
};

/** What the state filter keeps, as a phrase for Batch: "mona's merged pull requests". */
export function describeAuthored(login: string, query: AuthoredQuery): string {
  return `${login}'s ${query.state === null ? "" : `${STATE_WORDS[query.state].toLowerCase()} `}pull requests`;
}

export function AuthoredList({
  data,
  query,
  onQuery,
  onPage,
  onBatch,
  onThread,
}: {
  data: PersonActivityResult;
  query: AuthoredQuery;
  onQuery: (next: AuthoredQuery) => void;
  onPage: (page: number) => void;
  /** Opens Batch over every one the filter matches, on every page. */
  onBatch: (heading: string) => void;
  onThread: (seed: ThreadSeed, threadId: string | null) => void;
}) {
  const paging = data.authoredPaging;
  const facets = data.authoredFacets;
  return (
    <section className="mt-8" aria-labelledby="person-authored">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="person-authored" className="text-base font-semibold">
          Their pull requests
          <Count shown={paging.total} total={data.authoredTotal} />
        </h2>
        {data.authoredTotal === 0 ? null : (
          <span className="flex flex-wrap items-center gap-1.5">
            <SortMenu
              options={AUTHORED_SORTS}
              sort={query.sort}
              direction={query.direction}
              onSort={(sort, direction) => onQuery({ ...query, sort, direction })}
            />
            <ChoiceMenu
              label="State"
              value={query.state}
              choices={(["open", "draft", "merged", "closed"] as const).map((key) => ({ key, label: STATE_WORDS[key], count: facets[key] }))}
              onPick={(state) => onQuery({ ...query, state })}
            />
            <BatchButton count={paging.total} onBatch={() => onBatch(describeAuthored(data.login, query))} />
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Business days from ready for review. Weekends do not count.</p>
      {data.authored.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {data.authoredTotal === 0 ? "No pull requests in this period." : "None of their pull requests match the filter."}
        </p>
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
                  <span className={STATES[row.state].className}>{authoredState(row) === "draft" ? "Draft" : STATES[row.state].label}</span>
                  {" · "}
                  {row.firstReviewDays === null ? "no review" : `first review ${days(row.firstReviewDays)}`}
                  {row.followUps === 0 ? "" : ` · ${row.followUps} follow-up${row.followUps === 1 ? "" : "s"}`}
                  {row.mergeDays !== null ? ` · merged in ${days(row.mergeDays)}` : ""}
                  {row.waitingDays !== null ? ` · open ${days(row.waitingDays)}` : ""}
                  {query.sort === "size" && row.size !== null ? ` · ${row.size.toLocaleString()} lines` : ""}
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
            <PageButton label="Previous" onClick={() => onPage(paging.page - 1)} disabled={paging.page === 0} />
            <PageButton label="Next" onClick={() => onPage(paging.page + 1)} disabled={paging.page >= paging.pages - 1} />
          </span>
        </div>
      )}
    </section>
  );
}

type Awaiting = PersonActivityResult["awaiting"][number];

/** Sorts for the lists of what is waiting on a review: the longest wait first, or by who opened it. */
export const WAITING_SORTS: SortOption<"wait" | "author">[] = [
  { key: "wait", label: "Wait", asc: "Shortest", desc: "Longest", start: "desc" },
  { key: "author", label: "Author", asc: "A–Z", desc: "Z–A", start: "asc" },
];

export const WAITING_KEYS = {
  wait: (row: { waitingDays: number }) => row.waitingDays,
  author: (row: { author: string | null }) => row.author ?? "",
};

export function AwaitingList({
  rows,
  onBatch,
  onThread,
  now,
}: {
  /** Every one, longest wait first, as the server sends them. */
  rows: readonly Awaiting[];
  onBatch: (heading: string, rows: readonly BatchItem[]) => void;
  onThread: (seed: ThreadSeed, threadId: string | null) => void;
  now: number;
}) {
  const { query, setQuery, shown, authors } = useLocalList(rows, WAITING_KEYS, { sort: "wait", direction: "desc", author: null });
  return (
    <section className="mt-8" aria-labelledby="person-awaiting">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="person-awaiting" className="text-base font-semibold">
          Waiting on their review
          <Count shown={shown.length} total={rows.length} />
        </h2>
        {rows.length === 0 ? null : (
          <span className="flex flex-wrap items-center gap-1.5">
            <SortMenu options={WAITING_SORTS} sort={query.sort} direction={query.direction} onSort={(sort, direction) => setQuery({ ...query, sort, direction })} />
            <PeopleMenu label="Author" value={query.author} counts={authors} onPick={(author) => setQuery({ ...query, author })} />
            <BatchButton
              count={shown.length}
              onBatch={() => onBatch(`Waiting on their review${query.author === null ? "" : ` by ${query.author}`}`, shown)}
            />
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing is waiting on a review from them.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
          {shown.map((row) => (
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
  );
}

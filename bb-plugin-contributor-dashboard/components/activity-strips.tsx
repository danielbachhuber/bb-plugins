// The strips at the top of a person's page: a row per kind of activity, a
// square per day of the period, each row shaded on its own scale so a quiet
// kind still shows its pattern, and the row's total at the end. Past about
// four months a square is a week, since a day would be a sliver. Display only.
import { useState } from "react";

import type { ActivityDay } from "@/dashboard/contract";

import { AUTHOR_SERIES, REVIEW_SERIES } from "./person-chart";

type Kind = Exclude<keyof ActivityDay, "start">;

const KINDS: { kind: Kind; label: string; one: string; many: string; color: string }[] = [
  { kind: "opened", label: "Opened", one: "pull request opened", many: "pull requests opened", color: AUTHOR_SERIES.first.color },
  { kind: "merged", label: "Merged", one: "pull request merged", many: "pull requests merged", color: AUTHOR_SERIES.second.color },
  { kind: "reviewed", label: "Reviews", one: "review", many: "reviews", color: REVIEW_SERIES.second.color },
  { kind: "issuesOpened", label: "Issues opened", one: "issue opened", many: "issues opened", color: "#d9820a" },
  { kind: "issuesClosed", label: "Issues closed", one: "assigned issue closed", many: "assigned issues closed", color: "#7c8794" },
];

/** More days than this are drawn a week to a square. */
const DAYS_ABOVE_WEEKS = 120;
/** Few enough squares to write each count inside. */
const NUMBERED_UP_TO = 14;
const SHADES = [0, 0.28, 0.5, 0.74, 1];
const DAY_MS = 86_400_000;

interface Column {
  start: number;
  /** One day, or the days of one week. */
  days: readonly ActivityDay[];
}

/** A column per day, or per Monday week once there are too many days. */
export function columnsOf(days: readonly ActivityDay[]): Column[] {
  if (days.length <= DAYS_ABOVE_WEEKS) return days.map((day) => ({ start: day.start, days: [day] }));
  const columns: Column[] = [];
  for (const day of days) {
    if (columns.length === 0 || new Date(day.start).getDay() === 1) columns.push({ start: day.start, days: [] });
    (columns.at(-1)!.days as ActivityDay[]).push(day);
  }
  return columns;
}

/** Shade by quartile of the columns that had any, as GitHub's calendar does. */
function shadeOf(values: readonly number[]): (n: number) => number {
  const sorted = values.filter((n) => n > 0).sort((a, b) => a - b);
  const cut = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 1;
  const [q1, q2, q3] = [cut(0.25), cut(0.5), cut(0.75)];
  return (n) => (n === 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4);
}

const short = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const long = (at: number) => new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Which columns carry a date under them: every other day of two weeks, Mondays, or every fourth week. */
function labelled(columns: readonly Column[], index: number): boolean {
  if (columns.length <= NUMBERED_UP_TO) return index % 2 === 0;
  if (columns[0].days.length > 1) return index % 4 === 0;
  if (new Date(columns[index].start).getDay() !== 1) return false;
  return columns.length <= 60 || Math.round((columns[index].start - columns[0].start) / (7 * DAY_MS)) % 2 === 0;
}

export function ActivityStrips({ days, span }: { days: readonly ActivityDay[]; /** "six weeks", as the summary line says it. */ span: string }) {
  const [hover, setHover] = useState<{ kind: Kind; column: number } | null>(null);
  const columns = columnsOf(days);
  const numbered = columns.length <= NUMBERED_UP_TO;
  const total = days.reduce((sum, day) => sum + KINDS.reduce((n, k) => n + day[k.kind], 0), 0);

  return (
    <section className="mt-5" aria-label="Activity by day">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">{total.toLocaleString("en-US")}</span>
          <span className="text-muted-foreground"> pull requests, reviews and issues over {span}</span>
        </p>
        <span className="text-xs text-muted-foreground">Darker is more, each row on its own scale</span>
      </div>
      <div className="mt-2 rounded-lg border border-border bg-card px-3 pb-2 pt-2.5">
        <div
          className="grid items-center"
          style={{ gridTemplateColumns: `6.5rem repeat(${columns.length}, minmax(0, 1fr)) 3rem`, columnGap: 3, rowGap: 5 }}
        >
          {KINDS.flatMap((k) => {
            const values = columns.map((column) => column.days.reduce((n, day) => n + day[k.kind], 0));
            const shade = shadeOf(values);
            return [
              <span key={`${k.kind}-label`} className="truncate text-xs text-muted-foreground">
                {k.label}
              </span>,
              ...values.map((n, i) => {
                const column = columns[i];
                const weekend = column.days.length === 1 && [0, 6].includes(new Date(column.start).getDay());
                const when = column.days.length === 1 ? `on ${long(column.start)}` : `in the week of ${short(column.start)}`;
                const words = `${n} ${n === 1 ? k.one : k.many} ${when}`;
                const on = hover?.kind === k.kind && hover.column === i;
                return (
                  <span
                    key={`${k.kind}-${column.start}`}
                    role="img"
                    aria-label={words}
                    onMouseEnter={() => setHover({ kind: k.kind, column: i })}
                    onMouseLeave={() => setHover(null)}
                    className="relative flex items-center justify-center text-[10px] tabular-nums"
                    style={{
                      height: numbered ? 24 : 14,
                      borderRadius: 3,
                      background:
                        n === 0
                          ? `color-mix(in srgb, currentColor ${weekend ? 3 : 7}%, transparent)`
                          : `color-mix(in srgb, ${k.color} ${SHADES[shade(n)] * 100}%, transparent)`,
                      outline: on ? "1px solid currentColor" : undefined,
                    }}
                  >
                    {numbered && n > 0 ? (
                      <span style={shade(n) >= 3 ? { color: "#fff", fontWeight: 500 } : { opacity: 0.8 }}>{n}</span>
                    ) : null}
                    {on ? (
                      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
                        {words}
                      </span>
                    ) : null}
                  </span>
                );
              }),
              <span key={`${k.kind}-total`} className="text-right text-xs font-semibold tabular-nums" style={{ color: k.color }}>
                {values.reduce((a, b) => a + b, 0).toLocaleString("en-US")}
              </span>,
            ];
          })}
          <span />
          {columns.map((column, i) => (
            <span key={`date-${column.start}`} className="overflow-visible whitespace-nowrap text-[10px] text-muted-foreground">
              {labelled(columns, i) ? short(column.start) : ""}
            </span>
          ))}
          <span />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          From the dashboard's copy of this repository: commits, comments and other repositories aren't counted, so it won't
          match GitHub's profile.
        </p>
      </div>
    </section>
  );
}

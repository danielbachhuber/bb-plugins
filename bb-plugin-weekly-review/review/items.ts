/**
 * A gathered source, flattened into one row per thing it found, and back.
 *
 * Pure: no database here. `db.ts` stores what this produces, and reading a
 * week runs it in reverse, so the page and the digest keep receiving the same
 * `WeekData` shape they always have.
 */
import { createHash } from "node:crypto";
import type {
  CalendarEvent,
  GithubData,
  HarvestEntry,
  Issue,
  PullRequest,
  Review,
  Task,
  TodoistData,
} from "./types.js";

/** The sources whose results are stored as item rows. Docs are snapshots instead. */
export type ItemSource = "harvest" | "github" | "todoist" | "calendar";

export interface ItemInput {
  kind: string;
  externalId: string;
  /** Null when the source does not say which day (a Todoist task). */
  day: string | null;
  title: string;
  url: string | null;
  payload: unknown;
}

/** What each source's fetcher returns, by source. */
export interface SourceData {
  harvest: HarvestEntry[];
  github: GithubData;
  todoist: TodoistData;
  calendar: CalendarEvent[];
}

export function toItems<S extends ItemSource>(source: S, data: SourceData[S]): ItemInput[] {
  switch (source) {
    case "harvest":
      return unique(
        (data as HarvestEntry[]).map((entry) => ({
          kind: "entry",
          externalId: entry.id ?? harvestKey(entry),
          day: entry.day,
          title: entry.notes === "" ? entry.task : entry.notes,
          url: null,
          payload: entry,
        })),
      );
    case "github": {
      const github = data as GithubData;
      return unique([
        ...github.authored.map((pr) => numbered("authored", pr, pr.createdAt)),
        ...github.reviewed.map((review) => numbered("reviewed", review, review.updatedAt)),
        ...github.issuesCreated.map((issue) => numbered("issue-created", issue, issue.createdAt)),
        ...github.issuesAssigned.map((issue) =>
          numbered("issue-assigned", issue, issue.updatedAt ?? issue.createdAt)),
      ]);
    }
    case "todoist": {
      const todoist = data as TodoistData;
      return unique([
        ...todoist.completed.map((task) => tasked("completed", task)),
        ...todoist.incomplete.map((task) => tasked("incomplete", task)),
      ]);
    }
    case "calendar":
      return unique(
        (data as CalendarEvent[]).map((event) => ({
          kind: "event",
          externalId: event.id,
          day: event.day,
          title: event.title,
          url: event.url ?? null,
          payload: event,
        })),
      );
  }
  throw new Error(`Not an item source: ${String(source)}`);
}

/** Rows back into the fetcher's shape, given payloads in their stored order. */
export function fromItems<S extends ItemSource>(
  source: S,
  rows: Array<{ kind: string; payload: unknown }>,
): SourceData[S] {
  const of = <T>(kind: string) =>
    rows.filter((row) => row.kind === kind).map((row) => row.payload as T);
  switch (source) {
    case "harvest":
      return of<HarvestEntry>("entry") as SourceData[S];
    case "github":
      return {
        authored: of<PullRequest>("authored"),
        reviewed: of<Review>("reviewed"),
        issuesCreated: of<Issue>("issue-created"),
        issuesAssigned: of<Issue>("issue-assigned"),
      } as SourceData[S];
    case "todoist":
      return {
        completed: of<Task>("completed"),
        incomplete: of<Task>("incomplete"),
      } as SourceData[S];
    case "calendar":
      return of<CalendarEvent>("event") as SourceData[S];
  }
  throw new Error(`Not an item source: ${String(source)}`);
}

/** The empty result for a source, for a week that has never gathered it. */
export function emptyData<S extends ItemSource>(source: S): SourceData[S] {
  return fromItems(source, []);
}

/**
 * Stands in for a Harvest entry's id where there is none: weeks gathered
 * before the id was fetched. Stable, so importing the same file twice finds
 * the rows it wrote the first time.
 */
export function harvestKey(entry: HarvestEntry): string {
  const hash = createHash("sha1")
    .update([entry.day, entry.task, entry.hours, entry.notes].join("\u0000"))
    .digest("hex")
    .slice(0, 16);
  return `h:${hash}`;
}

function numbered(
  kind: string,
  item: { number: number; title: string; url: string },
  at: string,
): ItemInput {
  return {
    kind,
    externalId: String(item.number),
    day: at.slice(0, 10) || null,
    title: item.title,
    url: item.url,
    payload: item,
  };
}

function tasked(kind: string, task: Task): ItemInput {
  return {
    kind,
    externalId: task.id,
    day: null,
    title: task.content,
    url: task.url,
    payload: task,
  };
}

/**
 * Makes every (kind, id) pair distinct. Two identical Harvest entries on one
 * day hash alike, and a task with no id has an empty one; numbering the
 * repeats keeps each as its own row instead of one overwriting the other.
 */
function unique(items: ItemInput[]): ItemInput[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = `${item.kind}\u0000${item.externalId}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? item : { ...item, externalId: `${item.externalId}#${count}` };
  });
}

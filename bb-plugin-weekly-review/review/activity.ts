/**
 * What happened in a week, as one flat list the workstream rules can read.
 *
 * Only things that are activity count: time logged, pull requests opened or
 * merged, reviews, issues filed, tasks completed. The calendar looks ahead,
 * open tasks are a backlog, and assigned issues are a snapshot, so none of
 * them say what the week was spent on.
 *
 * Each activity's key is its `items` row's `source:kind:externalId`, built by
 * the same function, so a manual assignment survives every re-gather.
 */
import { addDays, instantToDay, type Range } from "./dates.js";
import { toItems } from "./items.js";
import { referenceIn } from "./overview.js";
import type { Day, HarvestEntry, Issue, PullRequest, Review, Task, WeekData } from "./types.js";

export type ActivityType = "time" | "pr" | "review" | "issue" | "task";

export interface Activity {
  key: string;
  type: ActivityType;
  /** Null when the source does not say (a completed Todoist task). */
  day: Day | null;
  title: string;
  url: string | null;
  /** Logged hours. Zero for everything but time entries. */
  hours: number;
  /** The PR or issue number, or the `#N` a time entry's note starts with. */
  ref: number | null;
  /** The Harvest task a time entry was booked to. */
  task: string | null;
  labels: string[];
}

export function activities(week: WeekData): Activity[] {
  const range: Range = { from: week.from, to: addDays(week.from, 6) };
  const out: Activity[] = [];

  for (const item of toItems("harvest", week.harvest.data)) {
    const entry = item.payload as HarvestEntry;
    const label = entry.notes.replace(/^#\d+\s*:?\s*/, "").trim();
    out.push({
      key: `harvest:${item.kind}:${item.externalId}`,
      type: "time",
      day: entry.day,
      title: label === "" ? entry.task : label,
      url: null,
      hours: entry.hours,
      ref: referenceIn(entry.notes),
      task: entry.task,
      labels: [],
    });
  }

  for (const item of toItems("github", week.github.data)) {
    const key = `github:${item.kind}:${item.externalId}`;
    if (item.kind === "authored") {
      const pr = item.payload as PullRequest;
      out.push(github(key, "pr", prDay(pr, range), pr));
    } else if (item.kind === "reviewed") {
      const review = item.payload as Review;
      out.push(github(key, "review", instantToDay(review.updatedAt), review));
    } else if (item.kind === "issue-created") {
      const issue = item.payload as Issue;
      out.push({ ...github(key, "issue", instantToDay(issue.createdAt), issue), labels: issue.labels });
    }
  }

  for (const item of toItems("todoist", week.todoist.data)) {
    if (item.kind !== "completed") continue;
    const task = item.payload as Task;
    out.push({
      key: `todoist:${item.kind}:${item.externalId}`,
      type: "task",
      day: null,
      title: task.content,
      url: task.url,
      hours: 0,
      ref: null,
      task: null,
      labels: task.labels,
    });
  }

  return out;
}

function github(
  key: string,
  type: ActivityType,
  day: Day,
  item: { number: number; title: string; url: string },
): Activity {
  return {
    key,
    type,
    day,
    title: item.title,
    url: item.url,
    hours: 0,
    ref: item.number,
    task: null,
    labels: [],
  };
}

/** Opened this week, or else merged this week: whichever put it in the week. */
function prDay(pr: PullRequest, range: Range): Day {
  const opened = instantToDay(pr.createdAt);
  if (opened >= range.from && opened <= range.to) return opened;
  return pr.closedAt === null ? opened : instantToDay(pr.closedAt);
}


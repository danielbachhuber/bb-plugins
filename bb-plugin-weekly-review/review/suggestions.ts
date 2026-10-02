/**
 * Workstreams to suggest, read out of the week's themes, so the first week
 * does not start with every hour in Unsorted.
 *
 * A theme becomes a suggestion only while most of its time entries are still
 * Unsorted and no workstream has its name. Accepting one creates the
 * workstream, the rules below, and an assignment for each of the theme's
 * entries this week, so the week is sorted at once and the rules carry the
 * workstream into later weeks.
 */
import type { Activity } from "./activity.js";
import { buildThemes, type Theme } from "./themes.js";
import type { TimeEntry } from "./time-sections.js";
import type { WeekData } from "./types.js";
import type { RuleType, Workstream, WorkstreamTable } from "./workstreams.js";

export interface Suggestion {
  name: string;
  hours: number;
  rules: Array<{ type: RuleType; value: string }>;
  /** This week's activities to assign to it. */
  keys: string[];
}

const MAX_SUGGESTIONS = 8;

export function suggestWorkstreams(
  week: WeekData,
  items: Activity[],
  table: WorkstreamTable,
  workstreams: Workstream[],
): Suggestion[] {
  const taken = new Set(workstreams.map((workstream) => workstream.name.toLowerCase()));
  const timeByShape = new Map<string, Activity[]>();
  for (const item of items) {
    if (item.type !== "time") continue;
    const shape = shapeOf(item.day ?? "", item.hours, item.title, item.task ?? "");
    timeByShape.set(shape, [...(timeByShape.get(shape) ?? []), item]);
  }

  const suggestions: Suggestion[] = [];
  for (const theme of buildThemes(week).themes) {
    if (taken.has(theme.title.toLowerCase())) continue;
    const keys = keysOf(theme, timeByShape);
    const unsorted = keys.filter((key) => table.activities[key]?.workstreamId === null);
    if (keys.length === 0 || unsorted.length * 2 < keys.length) continue;
    suggestions.push({ name: theme.title, hours: theme.hours, rules: rulesFor(theme), keys: unsorted });
    if (suggestions.length === MAX_SUGGESTIONS) break;
  }
  return suggestions;
}

/**
 * Rules that will find the theme's work in later weeks. A theme naming issues
 * gets their numbers; Code review gets its Harvest task, since
 * every review is booked there; One-on-ones has no phrase in common and gets
 * none, leaving its assignments to do the work this week.
 */
function rulesFor(theme: Theme): Suggestion["rules"] {
  if (theme.title === "Code review") {
    return theme.tasks
      .filter((task) => /review/i.test(task.task))
      .map((task) => ({ type: "task" as const, value: task.task }));
  }
  // A theme named for an issue is that issue's title; its number is the better rule.
  if (theme.refs.length > 0) return theme.refs.map((ref) => ({ type: "ref" as const, value: String(ref) }));
  return theme.title === "One-on-ones" ? [] : [{ type: "phrase", value: theme.title }];
}

/** Themes hold copies of entries, so they are found again by what they say. */
function keysOf(theme: Theme, timeByShape: Map<string, Activity[]>): string[] {
  const keys: string[] = [];
  for (const day of theme.days) {
    for (const entry of day.entries) {
      for (const item of timeByShape.get(shapeOfEntry(entry)) ?? []) {
        if (!keys.includes(item.key)) keys.push(item.key);
      }
    }
  }
  return keys;
}

function shapeOfEntry(entry: TimeEntry): string {
  return shapeOf(entry.day, entry.hours, entry.label === "" ? entry.task : entry.label, entry.task);
}

function shapeOf(day: string, hours: number, title: string, task: string): string {
  return [day, hours, title, task].join("\u0000");
}

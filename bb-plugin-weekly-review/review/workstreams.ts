/**
 * Workstreams: what the week's activity was for, decided by rules that grow
 * a little at a time, and the days-by-workstreams table built from them.
 *
 * Pure. The rules, assignments, and week choices come in as arguments; the
 * store that keeps them is `workstream-store.ts`.
 */
import type { Activity } from "./activity.js";
import { addDays } from "./dates.js";
import type { Day } from "./types.js";

export type RuleType = "ref" | "task" | "label" | "phrase";
export const RULE_TYPES: readonly RuleType[] = ["ref", "task", "label", "phrase"];

export interface Workstream {
  id: number;
  name: string;
  retiredAt: string | null;
}

export interface Rule {
  id: number;
  workstreamId: number;
  type: RuleType;
  value: string;
}

/** Why an activity landed where it did. */
export type MatchedBy = "assignment" | RuleType | null;

export interface Classification {
  /** Null is Unsorted. */
  workstreamId: number | null;
  by: MatchedBy;
  ruleId: number | null;
}

/** Whether one rule, on its own, matches one activity. */
export function ruleMatches(rule: Pick<Rule, "type" | "value">, activity: Activity): boolean {
  const value = rule.value.trim().toLowerCase();
  if (value === "") return false;
  switch (rule.type) {
    case "ref":
      return activity.ref !== null && String(activity.ref) === value.replace(/^#/, "");
    case "task":
      return activity.task !== null && activity.task.toLowerCase() === value;
    case "label":
      return activity.labels.some((label) => label.toLowerCase() === value);
    case "phrase":
      return activity.title.toLowerCase().includes(value);
  }
}

/**
 * The first match wins, in this order: a manual assignment, then a `ref`,
 * `task`, `label`, and `phrase` rule. Among phrases the longest wins, being
 * the most specific, then the oldest rule.
 *
 * An assignment of `null` means "leave this unsorted", which is different
 * from having no assignment at all.
 */
export function classify(
  activity: Activity,
  rules: Rule[],
  assignments: ReadonlyMap<string, number | null>,
): Classification {
  if (assignments.has(activity.key)) {
    return { workstreamId: assignments.get(activity.key) ?? null, by: "assignment", ruleId: null };
  }
  for (const type of RULE_TYPES) {
    const matching = rules.filter((rule) => rule.type === type && ruleMatches(rule, activity));
    if (matching.length === 0) continue;
    const best = matching.sort(
      (a, b) => b.value.trim().length - a.value.trim().length || a.id - b.id,
    )[0];
    return { workstreamId: best.workstreamId, by: type, ruleId: best.id };
  }
  return { workstreamId: null, by: null, ruleId: null };
}

export interface Counts {
  pr: number;
  review: number;
  issue: number;
  task: number;
}

export interface Cell {
  hours: number;
  counts: Counts;
  keys: string[];
}

export interface TableRow {
  /** Null for the Unsorted row. */
  workstreamId: number | null;
  name: string;
  /** In the week only because it was added by hand. */
  added: boolean;
  /** Linked to one of the week's priorities. */
  planned: boolean;
  cells: Record<Day, Cell>;
  /** Everything in the row, including activity with no day. */
  total: Cell;
  /** Hours over the week's hours, 0–1. Null when the week has no hours. */
  share: number | null;
}

export interface ClassifiedActivity extends Activity, Classification {}

export interface WorkstreamTable {
  days: Day[];
  rows: TableRow[];
  unsorted: TableRow;
  total: Cell;
  /** By key, for listing what a cell holds. */
  activities: Record<string, ClassifiedActivity>;
}

export type WeekChoice = "added" | "hidden";

/**
 * One row per workstream in the week: Planned (linked to a priority) before
 * Unplanned, and within each most hours first, then most activity, then by
 * name, with Unsorted kept apart.
 *
 * A workstream is in the week when it has activity, was added, or is linked
 * to a priority, so a priority with no time shows as an empty row. Hiding one
 * drops its row and counts its activity as Unsorted, so the rows always add up
 * to the week's total.
 */
export function buildTable(
  monday: Day,
  items: Activity[],
  workstreams: Workstream[],
  rules: Rule[],
  assignments: ReadonlyMap<string, number | null>,
  choices: ReadonlyMap<number, WeekChoice>,
  planned: ReadonlySet<number> = new Set(),
): WorkstreamTable {
  const byId = new Map(workstreams.map((workstream) => [workstream.id, workstream]));
  const weekdays = Array.from({ length: 5 }, (_, index) => addDays(monday, index));
  const weekend = [addDays(monday, 5), addDays(monday, 6)];
  const used = new Set(items.map((item) => item.day));
  const days = [...weekdays, ...weekend.filter((day) => used.has(day))];

  const classified: Record<string, ClassifiedActivity> = {};
  const rowsById = new Map<number, TableRow>();
  const unsorted = emptyRow(null, "Unsorted", days, false, false);
  const total = emptyCell();

  const rowFor = (id: number): TableRow => {
    let row = rowsById.get(id);
    if (row === undefined) {
      row = emptyRow(id, byId.get(id)?.name ?? `#${id}`, days, false, planned.has(id));
      rowsById.set(id, row);
    }
    return row;
  };

  for (const item of items) {
    const result = classify(item, rules, assignments);
    // A rule or assignment for a workstream that no longer exists sorts nowhere.
    const known = result.workstreamId !== null && byId.has(result.workstreamId);
    const shown = known && choices.get(result.workstreamId as number) !== "hidden";
    const row = shown ? rowFor(result.workstreamId as number) : unsorted;
    classified[item.key] = { ...item, ...(known ? result : { workstreamId: null, by: null, ruleId: null }) };

    add(row.total, item);
    add(total, item);
    if (item.day !== null && row.cells[item.day] !== undefined) add(row.cells[item.day], item);
  }

  for (const [id, choice] of choices) {
    const workstream = byId.get(id);
    if (choice !== "added" || workstream === undefined || rowsById.has(id)) continue;
    if (workstream.retiredAt !== null) continue;
    rowsById.set(id, emptyRow(id, workstream.name, days, true, planned.has(id)));
  }
  for (const id of planned) {
    const workstream = byId.get(id);
    if (workstream === undefined || rowsById.has(id) || choices.get(id) === "hidden") continue;
    rowsById.set(id, emptyRow(id, workstream.name, days, false, true));
  }

  const hours = total.hours;
  const finish = (row: TableRow) => {
    row.total.hours = round(row.total.hours);
    for (const cell of Object.values(row.cells)) cell.hours = round(cell.hours);
    row.share = hours > 0 ? row.total.hours / hours : null;
    return row;
  };

  const rows = [...rowsById.values()]
    .map(finish)
    .sort(
      (a, b) =>
        Number(b.planned) - Number(a.planned) ||
        b.total.hours - a.total.hours ||
        activityCount(b.total) - activityCount(a.total) ||
        a.name.localeCompare(b.name),
    );
  total.hours = round(total.hours);

  return { days, rows, unsorted: finish(unsorted), total, activities: classified };
}

export interface RulePreview {
  /** Activities the rule matches, across every week given. */
  matches: number;
  /** How many of those are Unsorted today. */
  unsorted: number;
  weeks: number;
  examples: string[];
}

/** What a rule would catch, before it is saved. */
export function previewRule(
  rule: Pick<Rule, "type" | "value">,
  weeks: Array<{ items: Activity[] }>,
  rules: Rule[],
  assignments: ReadonlyMap<string, number | null>,
): RulePreview {
  let matches = 0;
  let unsorted = 0;
  let weeksMatched = 0;
  const examples: string[] = [];
  for (const week of weeks) {
    let any = false;
    for (const item of week.items) {
      if (!ruleMatches(rule, item)) continue;
      any = true;
      matches += 1;
      if (classify(item, rules, assignments).workstreamId === null) unsorted += 1;
      if (examples.length < 5 && !examples.includes(item.title)) examples.push(item.title);
    }
    if (any) weeksMatched += 1;
  }
  return { matches, unsorted, weeks: weeksMatched, examples };
}

/** The rule value an activity suggests for each rule type, where it has one. */
export function ruleSeeds(activity: Activity): Array<{ type: RuleType; value: string }> {
  const seeds: Array<{ type: RuleType; value: string }> = [];
  if (activity.ref !== null) seeds.push({ type: "ref", value: String(activity.ref) });
  if (activity.task !== null) seeds.push({ type: "task", value: activity.task });
  for (const label of activity.labels) seeds.push({ type: "label", value: label });
  seeds.push({ type: "phrase", value: activity.title });
  return seeds;
}

function emptyCell(): Cell {
  return { hours: 0, counts: { pr: 0, review: 0, issue: 0, task: 0 }, keys: [] };
}

function emptyRow(
  id: number | null,
  name: string,
  days: Day[],
  added: boolean,
  planned: boolean,
): TableRow {
  return {
    workstreamId: id,
    name,
    added,
    planned,
    cells: Object.fromEntries(days.map((day) => [day, emptyCell()])),
    total: emptyCell(),
    share: null,
  };
}

function add(cell: Cell, item: Activity) {
  cell.hours += item.hours;
  if (item.type !== "time") cell.counts[item.type] += 1;
  cell.keys.push(item.key);
}

function activityCount(cell: Cell): number {
  return cell.keys.length;
}

function round(hours: number): number {
  return Math.round(hours * 100) / 100;
}

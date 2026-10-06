// Storage for the week's priorities. One row per week, its list as JSON, so a
// rewrite is one statement and the merge stays in priorities.ts.
import { mergeDone, priorityWeekSchema, storedPrioritySchema, type PriorityInput, type PriorityWeek } from "./priorities.js";
import type { DatabaseLike } from "./store.js";

export interface PriorityWrite {
  monday: string;
  source: string;
  heading: string | null;
  hoursAt: string | null;
  items: PriorityInput[];
}

export interface PriorityStore {
  read(monday: string): PriorityWeek | null;
  /** Replaces the week's list, keeping each unchanged priority's checked state. */
  write(week: PriorityWrite, now: Date): void;
  /** Checks or unchecks one priority. False when the week or the priority is not there. */
  setDone(monday: string, text: string, done: boolean, now: Date): boolean;
}

interface Row {
  monday: string;
  source: string;
  heading: string | null;
  hours_at: string | null;
  written_at: string;
  items: string;
}

export function createPriorityStore(db: DatabaseLike): PriorityStore {
  const select = db.prepare(`SELECT * FROM priority_weeks WHERE monday = ?`);
  const upsert = db.prepare(
    `INSERT INTO priority_weeks (monday, source, heading, hours_at, written_at, items) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(monday) DO UPDATE SET source = excluded.source, heading = excluded.heading,
       hours_at = excluded.hours_at, written_at = excluded.written_at, items = excluded.items`,
  );
  const updateItems = db.prepare(`UPDATE priority_weeks SET items = ? WHERE monday = ?`);

  function read(monday: string): PriorityWeek | null {
    const row = select.get(monday) as Row | undefined;
    if (row === undefined) return null;
    return priorityWeekSchema.parse({
      monday: row.monday,
      source: row.source,
      heading: row.heading,
      hoursAt: row.hours_at,
      writtenAt: row.written_at,
      items: storedPrioritySchema.array().parse(JSON.parse(row.items)),
    });
  }

  const write = db.transaction((week: PriorityWrite, now: Date) => {
    const items = mergeDone(read(week.monday)?.items ?? [], week.items);
    upsert.run(week.monday, week.source, week.heading, week.hoursAt, now.toISOString(), JSON.stringify(items));
  });

  const setDone = db.transaction((monday: string, text: string, done: boolean, now: Date): boolean => {
    const week = read(monday);
    const at = week?.items.findIndex((each) => each.text === text.trim()) ?? -1;
    if (week === null || at === -1) return false;
    const items = week.items.map((each, index) =>
      index === at ? { ...each, doneAt: done ? (each.doneAt ?? now.toISOString()) : null } : each,
    );
    updateItems.run(JSON.stringify(items), monday);
    return true;
  });

  return { read, write: (week, now) => write(week, now), setDone: (monday, text, done, now) => setDone(monday, text, done, now) };
}

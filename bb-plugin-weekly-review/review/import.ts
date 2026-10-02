/**
 * Moves weeks gathered to files into the database, once.
 *
 * Before the database, each week was a directory:
 *
 *   data/weeks/2026-08-31/week.json      everything the gather produced
 *   data/weeks/2026-08-31/docs/*.txt     the reference docs' text
 *   data/weeks/2026-08-31/feedback.json  the agent's read of the entry
 *   data/weeks/2026-08-31/reflect.json   the daily notes agent's result
 *   data/weeks/2026-08-31/slack.json     the Slack agent's result
 *
 * A week is imported only when the database has no gather for it, so running
 * this on every load is safe, and a week gathered since is never overwritten.
 * The files are left where they are.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { feedbackSchema } from "./agents.js";
import { SOURCE_NAMES, type DocSnapshot, type SourceStatus, type WeekStore } from "./db.js";
import { reflectNoteSchema, slackThreadSchema, sourceResult, weekDataSchema } from "./schema.js";
import type { SourceResult } from "./types.js";

const MONDAY_DIR = /^\d{4}-\d{2}-\d{2}$/;

/** Returns the Mondays it imported. */
export async function importWeekFiles(store: WeekStore, weeksDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(weeksDir);
  } catch {
    return [];
  }

  const imported: string[] = [];
  for (const monday of entries.filter((name) => MONDAY_DIR.test(name)).sort()) {
    if (store.hasGathers(monday)) continue;
    const dir = join(weeksDir, monday);
    const week = await readJson(join(dir, "week.json"), weekDataSchema);
    if (week === null) continue;

    const at = week.generatedAt;
    const id = store.startGather(monday, week.to, "import", at);
    const statuses: SourceStatus[] = [];
    const record = (name: string, result: SourceResult<unknown>) =>
      statuses.push({
        name,
        ok: result.ok,
        ...(result.error === undefined ? {} : { error: result.error }),
        millis: 0,
      });

    record(SOURCE_NAMES.harvest, week.harvest);
    if (week.harvest.ok) store.writeItems(monday, "harvest", week.harvest.data, at);
    record(SOURCE_NAMES.github, week.github);
    if (week.github.ok) store.writeItems(monday, "github", week.github.data, at);
    record(SOURCE_NAMES.todoist, week.todoist);
    if (week.todoist.ok) store.writeItems(monday, "todoist", week.todoist.data, at);
    if (week.calendar !== undefined) {
      record(SOURCE_NAMES.calendar, week.calendar);
      if (week.calendar.ok) store.writeItems(monday, "calendar", week.calendar.data, at);
    }

    record(SOURCE_NAMES.docs, week.docs);
    const docs: DocSnapshot[] = [];
    for (const doc of week.docs.data) {
      let text: string | undefined;
      if (doc.cachedPath !== undefined) {
        try {
          text = await readFile(join(dir, doc.cachedPath), "utf8");
        } catch {
          text = undefined;
        }
      }
      docs.push({
        id: doc.id,
        label: doc.label,
        ...(text === undefined ? {} : { text }),
        ...(doc.error === undefined ? {} : { error: doc.error }),
      });
    }
    store.writeDocs(monday, docs, at);

    const slack = week.slack ?? (await readSidecar(join(dir, "slack.json"), slackThreadSchema, at));
    if (slack !== undefined) store.writeAgentResult(monday, "slack", slack, at);
    const reflect =
      week.reflect ?? (await readSidecar(join(dir, "reflect.json"), reflectNoteSchema, at));
    if (reflect !== undefined) store.writeAgentResult(monday, "reflect", reflect, at);
    const feedback = await readJson(join(dir, "feedback.json"), feedbackSchema);
    if (feedback !== null) {
      store.writeAgentResult(monday, "feedback", feedback, feedback.reviewedAt ?? at);
    }

    store.finishGather(id, statuses, at);
    imported.push(monday);
  }
  return imported;
}

/** Either a bare array, as an agent wrote it, or a full SourceResult envelope. */
async function readSidecar<T extends z.ZodTypeAny>(
  path: string,
  item: T,
  at: string,
): Promise<SourceResult<Array<z.infer<T>>> | undefined> {
  const parsed = await readJson(path, sourceResult(item.array()).or(item.array()));
  if (parsed === null) return undefined;
  return Array.isArray(parsed) ? { ok: true, fetchedAt: at, data: parsed } : parsed;
}

/** A malformed or missing file reads as absent rather than throwing. */
async function readJson<T extends z.ZodTypeAny>(path: string, schema: T): Promise<z.infer<T> | null> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

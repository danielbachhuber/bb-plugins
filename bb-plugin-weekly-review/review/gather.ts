/**
 * Gathers one week into the database. Every source is captured rather than
 * awaited bare, so a missing credential is reported on the page instead of
 * failing the run, and a failed source leaves its last good rows in place.
 */
import { comingUpWindow, type Range } from "./dates.js";
import type { DocSnapshot, GatherTrigger, SourceStatus, WeekStore } from "./db.js";
import { SOURCE_NAMES } from "./db.js";
import type { ItemSource, SourceData } from "./items.js";
import type { Sources } from "./sources.js";
import type { SourceResult } from "./types.js";
import { capture } from "./fetch/shell.js";
import { fetchCalendar } from "./fetch/calendar.js";
import { fetchDocs } from "./fetch/docs.js";
import { fetchGithub } from "./fetch/github.js";
import { fetchHarvest } from "./fetch/harvest.js";
import { fetchTodoist } from "./fetch/todoist.js";

/** Where the CLIs are. Paths identify nobody, so these stay in settings. */
export interface Tools {
  gh: string;
  hrvst: string;
  td: string;
  /** The Google Workspace CLI, which is how the calendar is read. */
  gws: string;
  /** Script that prints a Google Doc as plain text, given its id. */
  fetchDocScript: string;
}

export type GatherConfig = Sources & Tools;

/** One function per source, so a test can stand in for the CLIs. */
export interface Fetchers {
  harvest(range: Range): Promise<SourceData["harvest"]>;
  github(range: Range): Promise<SourceData["github"]>;
  todoist(range: Range): Promise<SourceData["todoist"]>;
  /** Reads what is ahead of today, not the week being gathered. */
  calendar(window: Range): Promise<SourceData["calendar"]>;
  /** Null when no reference docs are configured. */
  docs: (() => Promise<DocSnapshot[]>) | null;
}

export function cliFetchers(config: GatherConfig): Fetchers {
  return {
    harvest: (range) => fetchHarvest(range, config),
    github: (range) => fetchGithub(range, config),
    todoist: (range) => fetchTodoist(range, config),
    calendar: (window) => fetchCalendar(window, config),
    docs: config.docs.length === 0 ? null : () => fetchDocs(config),
  };
}

export interface GatherOptions {
  trigger: GatherTrigger;
  /**
   * Whether to fetch the reference docs. A scheduled run skips them after
   * the day's first, since each doc is its own Google request and they
   * rarely change within a day.
   */
  includeDocs: boolean;
  now?: () => Date;
}

export interface GatherResult {
  monday: string;
  sources: SourceStatus[];
}

export async function gatherWeek(
  store: WeekStore,
  range: Range,
  fetchers: Fetchers,
  options: GatherOptions,
): Promise<GatherResult> {
  const now = options.now ?? (() => new Date());
  const gatherId = store.startGather(range.from, range.to, options.trigger, now().toISOString());
  const sources: SourceStatus[] = [];

  const timed = async <T>(name: string, fallback: T, fn: () => Promise<T>) => {
    const started = Date.now();
    const result: SourceResult<T> = await capture(fallback, fn);
    sources.push({
      name,
      ok: result.ok,
      ...(result.error === undefined ? {} : { error: result.error }),
      millis: Date.now() - started,
    });
    return result;
  };

  // What is still ahead, from today rather than from the range: a week that
  // has already finished says nothing about next week.
  const ahead = comingUpWindow(now());

  // The scriptable CLIs run concurrently; docs are sequential inside their fetcher.
  const [harvest, github, todoist, calendar] = await Promise.all([
    timed(SOURCE_NAMES.harvest, [], () => fetchers.harvest(range)),
    timed(
      SOURCE_NAMES.github,
      { authored: [], reviewed: [], issuesCreated: [], issuesAssigned: [] },
      () => fetchers.github(range),
    ),
    timed(SOURCE_NAMES.todoist, { completed: [], incomplete: [] }, () => fetchers.todoist(range)),
    timed(SOURCE_NAMES.calendar, [], () => fetchers.calendar(ahead)),
  ]);

  const at = now().toISOString();
  const write = <S extends ItemSource>(source: S, result: SourceResult<SourceData[S]>) => {
    if (result.ok) store.writeItems(range.from, source, result.data, at);
  };
  write("harvest", harvest);
  write("github", github);
  write("todoist", todoist);
  write("calendar", calendar);

  if (options.includeDocs) {
    if (fetchers.docs === null) {
      sources.push({ name: SOURCE_NAMES.docs, ok: false, error: "No reference docs configured.", millis: 0 });
      store.writeDocs(range.from, [], at);
    } else {
      const docs = await timed(SOURCE_NAMES.docs, [] as DocSnapshot[], fetchers.docs);
      if (docs.ok) store.writeDocs(range.from, docs.data, now().toISOString());
    }
  }

  store.finishGather(gatherId, sources, now().toISOString());
  return { monday: range.from, sources };
}

/**
 * One gather per week at a time. A scheduled run that fires while Generate is
 * still going for the same week waits for it and shares its result, rather
 * than running every CLI a second time.
 */
export function createGatherQueue() {
  const running = new Map<string, Promise<GatherResult>>();
  return function once(monday: string, run: () => Promise<GatherResult>): Promise<GatherResult> {
    const existing = running.get(monday);
    if (existing !== undefined) return existing;
    const started = run().finally(() => running.delete(monday));
    running.set(monday, started);
    return started;
  };
}

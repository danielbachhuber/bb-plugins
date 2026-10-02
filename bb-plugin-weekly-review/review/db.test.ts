import Database from "better-sqlite3";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWeekStore, type WeekStore } from "./db.js";
import { createGatherQueue, gatherWeek, type Fetchers } from "./gather.js";
import { importWeekFiles } from "./import.js";
import { MIGRATIONS } from "./sources.js";
import type { GithubData, HarvestEntry, PullRequest, Task } from "./types.js";

function store(): WeekStore {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createWeekStore(db);
}

const MONDAY = "2026-09-07";
const RANGE = { from: MONDAY, to: "2026-09-09" };

const pr = (number: number, title: string): PullRequest => ({
  number,
  title,
  url: `https://github.com/acme/widgets/pull/${number}`,
  state: "open",
  createdAt: "2026-09-08T10:00:00Z",
  closedAt: null,
  isDraft: false,
});

const entry = (id: string, notes: string, hours = 1): HarvestEntry => ({
  id,
  day: "2026-09-08",
  task: "Development",
  hours,
  notes,
});

const task = (id: string, content: string): Task => ({
  id,
  content,
  url: `https://app.todoist.com/app/task/${id}`,
  priority: 1,
  due: null,
  dueString: null,
  recurring: false,
  labels: [],
});

function github(authored: PullRequest[] = [], reviewed: GithubData["reviewed"] = []): GithubData {
  return { authored, reviewed, issuesCreated: [], issuesAssigned: [] };
}

function fetchers(overrides: Partial<Fetchers> = {}): Fetchers {
  return {
    harvest: async () => [entry("1", "Widget sync")],
    github: async () => github([pr(12, "Add the widget sync")]),
    todoist: async () => ({ completed: [task("t1", "Write the sync doc")], incomplete: [] }),
    calendar: async () => [],
    docs: async () => [{ id: "doc-a", label: "1:1 Octocat", text: "## 2026-09-08\nTalked sync." }],
    ...overrides,
  };
}

/** A clock that moves a minute on every call, so each write has its own time. */
function clock(start = "2026-09-08T12:00:00Z") {
  let at = new Date(start).getTime();
  return () => {
    at += 60_000;
    return new Date(at);
  };
}

describe("gatherWeek", () => {
  it("reads back the week it wrote", async () => {
    const weeks = store();
    const result = await gatherWeek(weeks, RANGE, fetchers(), {
      trigger: "manual",
      includeDocs: true,
      now: clock(),
    });

    expect(result.sources.map((source) => [source.name, source.ok])).toEqual([
      ["Harvest", true],
      ["GitHub", true],
      ["Todoist", true],
      ["Calendar", true],
      ["Docs", true],
    ]);
    const week = weeks.readWeek(MONDAY);
    expect(week?.to).toBe("2026-09-09");
    expect(week?.harvest.data).toEqual([entry("1", "Widget sync")]);
    expect(week?.github.data.authored).toEqual([pr(12, "Add the widget sync")]);
    expect(week?.todoist.data.completed.map((t) => t.id)).toEqual(["t1"]);
    expect(week?.docs.data).toEqual([
      { id: "doc-a", label: "1:1 Octocat", url: "https://docs.google.com/document/d/doc-a/edit" },
    ]);
    expect(weeks.docText(MONDAY, "doc-a")).toContain("Talked sync.");
    expect(weeks.listWeeks()).toEqual([
      { monday: MONDAY, to: "2026-09-09", generatedAt: week?.generatedAt },
    ]);
  });

  it("keeps first_seen_at from the first gather and drops what upstream no longer has", async () => {
    const weeks = store();
    const now = clock();
    await gatherWeek(weeks, RANGE, fetchers({
      harvest: async () => [entry("1", "Widget sync"), entry("2", "Gadget review")],
    }), { trigger: "schedule", includeDocs: false, now });
    await gatherWeek(weeks, RANGE, fetchers({
      harvest: async () => [entry("1", "Widget sync", 2.5)],
    }), { trigger: "schedule", includeDocs: false, now });

    // The edited entry is updated in place; the deleted one leaves the week.
    expect(weeks.readWeek(MONDAY)?.harvest.data).toEqual([entry("1", "Widget sync", 2.5)]);
  });

  it("keeps the last good rows when a source fails, and says it failed", async () => {
    const weeks = store();
    const now = clock();
    await gatherWeek(weeks, RANGE, fetchers(), { trigger: "schedule", includeDocs: true, now });
    const firstAt = weeks.readWeek(MONDAY)?.github.fetchedAt;

    await gatherWeek(weeks, RANGE, fetchers({
      github: async () => {
        throw new Error("gh: token expired");
      },
    }), { trigger: "schedule", includeDocs: false, now });

    const week = weeks.readWeek(MONDAY);
    expect(week?.github.ok).toBe(false);
    expect(week?.github.error).toBe("gh: token expired");
    expect(week?.github.fetchedAt).toBe(firstAt);
    expect(week?.github.data.authored).toEqual([pr(12, "Add the widget sync")]);
    // Docs were skipped this run, so they stand as the first run left them.
    expect(week?.docs.ok).toBe(true);
    expect(week?.docs.data).toHaveLength(1);
  });

  it("reports a source that has never succeeded as failed and empty", async () => {
    const weeks = store();
    await gatherWeek(weeks, RANGE, fetchers({
      todoist: async () => {
        throw new Error("td: not logged in");
      },
    }), { trigger: "manual", includeDocs: true, now: clock() });

    const week = weeks.readWeek(MONDAY);
    expect(week?.todoist).toMatchObject({ ok: false, error: "td: not logged in" });
    expect(week?.todoist.data).toEqual({ completed: [], incomplete: [] });
  });

  it("stores the same PR as authored and reviewed as two rows", async () => {
    const weeks = store();
    const review = {
      number: 12, title: "Add the widget sync", url: "https://github.com/acme/widgets/pull/12",
      author: "hubber", state: "open", updatedAt: "2026-09-08T11:00:00Z",
    };
    await gatherWeek(weeks, RANGE, fetchers({
      github: async () => github([pr(12, "Add the widget sync")], [review]),
    }), { trigger: "manual", includeDocs: false, now: clock() });

    const data = weeks.readWeek(MONDAY)?.github.data;
    expect(data?.authored).toHaveLength(1);
    expect(data?.reviewed).toEqual([review]);
  });

  it("keeps a doc's previous text when it fails to fetch", async () => {
    const weeks = store();
    const now = clock();
    await gatherWeek(weeks, RANGE, fetchers(), { trigger: "manual", includeDocs: true, now });
    await gatherWeek(weeks, RANGE, fetchers({
      docs: async () => [
        { id: "doc-a", label: "1:1 Octocat", error: "timeout" },
        { id: "doc-b", label: "1:1 Hubber", text: "## 2026-09-09\nNew." },
      ],
    }), { trigger: "manual", includeDocs: true, now });

    expect(weeks.docText(MONDAY, "doc-a")).toContain("Talked sync.");
    expect(weeks.readWeek(MONDAY)?.docs.data.map((doc) => [doc.id, doc.error])).toEqual([
      ["doc-a", "timeout"],
      ["doc-b", undefined],
    ]);
  });
});

describe("createGatherQueue", () => {
  it("runs one gather per week at a time and shares its result", async () => {
    const once = createGatherQueue();
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = async () => {
      runs += 1;
      await gate;
      return { monday: MONDAY, sources: [] };
    };

    const first = once(MONDAY, run);
    const second = once(MONDAY, run);
    release();
    expect(await first).toBe(await second);
    expect(runs).toBe(1);

    await once(MONDAY, run);
    expect(runs).toBe(2);
  });
});

describe("importWeekFiles", () => {
  async function weekFiles() {
    const root = await mkdtemp(join(tmpdir(), "weekly-review-"));
    const dir = join(root, MONDAY);
    await mkdir(join(dir, "docs"), { recursive: true });
    const ok = (data: unknown) => ({ ok: true, fetchedAt: "2026-09-11T20:00:00.000Z", data });
    await writeFile(join(dir, "week.json"), JSON.stringify({
      from: MONDAY,
      to: "2026-09-11",
      generatedAt: "2026-09-11T20:00:00.000Z",
      // No ids: files from before Harvest's id was fetched.
      harvest: ok([
        { day: "2026-09-08", task: "Development", hours: 1, notes: "Widget sync" },
        { day: "2026-09-08", task: "Development", hours: 1, notes: "Widget sync" },
      ]),
      github: ok(github([pr(12, "Add the widget sync")])),
      todoist: ok({ completed: [], incomplete: [task("t2", "File the gadget issue")] }),
      docs: ok([{
        id: "doc-a", label: "1:1 Octocat", url: "https://docs.google.com/document/d/doc-a/edit",
        cachedPath: "docs/1-1-octocat.txt",
      }]),
    }));
    await writeFile(join(dir, "docs", "1-1-octocat.txt"), "## 2026-09-08\nTalked sync.");
    await writeFile(join(dir, "slack.json"), JSON.stringify([
      { day: "2026-09-09", channel: "#widgets", summary: "Agreed the sync order." },
    ]));
    await writeFile(join(dir, "feedback.json"), JSON.stringify({
      assessment: "Covers the sync; light on reviews.", missing: [], expand: [],
    }));
    await mkdir(join(root, "not-a-week"));
    return root;
  }

  it("imports each week once, with its docs and agent results", async () => {
    const weeks = store();
    const root = await weekFiles();

    expect(await importWeekFiles(weeks, root)).toEqual([MONDAY]);
    expect(await importWeekFiles(weeks, root)).toEqual([]);

    const week = weeks.readWeek(MONDAY);
    expect(week?.generatedAt).toBe("2026-09-11T20:00:00.000Z");
    // Two identical entries stay two entries.
    expect(week?.harvest.data).toHaveLength(2);
    expect(week?.github.data.authored).toEqual([pr(12, "Add the widget sync")]);
    expect(week?.todoist.data.incomplete.map((t) => t.id)).toEqual(["t2"]);
    expect(week?.calendar).toBeUndefined();
    expect(week?.slack?.data).toEqual([
      { day: "2026-09-09", channel: "#widgets", summary: "Agreed the sync order." },
    ]);
    expect(weeks.docText(MONDAY, "doc-a")).toContain("Talked sync.");
    expect(weeks.readFeedback(MONDAY)?.assessment).toBe("Covers the sync; light on reviews.");
  });

  it("leaves a week alone once it has been gathered into the database", async () => {
    const weeks = store();
    await gatherWeek(weeks, { from: MONDAY, to: "2026-09-11" }, fetchers(), {
      trigger: "manual", includeDocs: false, now: clock(),
    });

    expect(await importWeekFiles(weeks, await weekFiles())).toEqual([]);
    expect(weeks.readWeek(MONDAY)?.slack).toBeUndefined();
  });

  it("reads a missing directory as nothing to import", async () => {
    expect(await importWeekFiles(store(), join(tmpdir(), "weekly-review-missing"))).toEqual([]);
  });
});

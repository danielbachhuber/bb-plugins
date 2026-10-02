import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { activities, type Activity } from "./activity.js";
import { MIGRATIONS } from "./sources.js";
import { createWorkstreamStore } from "./workstream-store.js";
import { buildTable, classify, previewRule, type Rule, type Workstream } from "./workstreams.js";
import type { WeekData } from "./types.js";

const MONDAY = "2026-09-07";

function item(overrides: Partial<Activity> & { key: string }): Activity {
  return {
    type: "time",
    day: "2026-09-08",
    title: "",
    url: null,
    hours: 0,
    ref: null,
    task: null,
    labels: [],
    ...overrides,
  };
}

const widgets: Workstream = { id: 1, name: "Widget sync", retiredAt: null };
const gadgets: Workstream = { id: 2, name: "Gadget launch", retiredAt: null };
const old: Workstream = { id: 3, name: "Old migration", retiredAt: "2026-08-01T00:00:00Z" };

let ruleId = 1;
const rule = (workstreamId: number, type: Rule["type"], value: string): Rule => ({
  id: ruleId++,
  workstreamId,
  type,
  value,
});

describe("classify", () => {
  it("prefers an assignment, then ref, task, label, and phrase", () => {
    const entry = item({ key: "harvest:entry:1", title: "Widget sync review", ref: 12, task: "Development" });
    const rules = [
      rule(2, "phrase", "widget"),
      rule(2, "task", "Development"),
      rule(1, "ref", "#12"),
    ];
    expect(classify(entry, rules, new Map())).toMatchObject({ workstreamId: 1, by: "ref" });
    expect(classify(entry, rules.slice(0, 2), new Map())).toMatchObject({ workstreamId: 2, by: "task" });
    expect(classify(entry, rules, new Map([[entry.key, 2]]))).toMatchObject({
      workstreamId: 2,
      by: "assignment",
    });
    // Assigned to nothing on purpose: stays Unsorted whatever the rules say.
    expect(classify(entry, rules, new Map([[entry.key, null]]))).toMatchObject({
      workstreamId: null,
      by: "assignment",
    });
  });

  it("takes the longest matching phrase", () => {
    const entry = item({ key: "github:authored:5", title: "Widget sync for gadgets" });
    const rules = [rule(2, "phrase", "widget"), rule(1, "phrase", "widget sync")];
    expect(classify(entry, rules, new Map()).workstreamId).toBe(1);
  });

  it("matches labels and tasks without regard to case", () => {
    const task = item({ key: "todoist:completed:t1", type: "task", day: null, labels: ["Widgets"] });
    expect(classify(task, [rule(1, "label", "widgets")], new Map()).workstreamId).toBe(1);
  });
});

describe("buildTable", () => {
  const items: Activity[] = [
    item({ key: "harvest:entry:1", title: "Widget sync", hours: 2, day: "2026-09-07" }),
    item({ key: "harvest:entry:2", title: "Gadget launch plan", hours: 1.5, day: "2026-09-08" }),
    item({ key: "harvest:entry:3", title: "Inbox", hours: 0.5, day: "2026-09-08" }),
    item({ key: "github:authored:12", type: "pr", title: "Widget sync API", day: "2026-09-08" }),
    item({ key: "todoist:completed:t1", type: "task", title: "Widget sync doc", day: null }),
  ];
  const rules = [rule(1, "phrase", "widget sync"), rule(2, "phrase", "gadget")];

  it("rows add up to the week, with day-less tasks in Total only", () => {
    const table = buildTable(MONDAY, items, [widgets, gadgets, old], rules, new Map(), new Map());
    expect(table.days).toEqual(["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]);
    expect(table.rows.map((row) => [row.name, row.total.hours])).toEqual([
      ["Widget sync", 2],
      ["Gadget launch", 1.5],
    ]);
    const widgetRow = table.rows[0];
    expect(widgetRow.cells["2026-09-08"].counts.pr).toBe(1);
    expect(widgetRow.total.counts).toEqual({ pr: 1, review: 0, issue: 0, task: 1 });
    expect(widgetRow.share).toBe(0.5);
    expect(table.unsorted.total.hours).toBe(0.5);
    const sum = table.rows.reduce((hours, row) => hours + row.total.hours, table.unsorted.total.hours);
    expect(sum).toBe(table.total.hours);
  });

  it("moves a hidden workstream's activity to Unsorted and shows an added one empty", () => {
    const choices = new Map([
      [2, "hidden" as const],
      [3, "added" as const],
    ]);
    const added = { ...old, retiredAt: null };
    const table = buildTable(MONDAY, items, [widgets, gadgets, added], rules, new Map(), choices);
    expect(table.rows.map((row) => [row.name, row.total.hours, row.added])).toEqual([
      ["Widget sync", 2, false],
      ["Old migration", 0, true],
    ]);
    expect(table.unsorted.total.hours).toBe(2);
  });

  it("adds a weekend column only when something happened on it", () => {
    const weekend = [...items, item({ key: "harvest:entry:9", hours: 1, day: "2026-09-12" })];
    const table = buildTable(MONDAY, weekend, [widgets], rules, new Map(), new Map());
    expect(table.days.at(-1)).toBe("2026-09-12");
    expect(table.days).toHaveLength(6);
  });

  it("does not add a retired workstream to a week, but still counts its matches", () => {
    const table = buildTable(
      MONDAY,
      [item({ key: "harvest:entry:1", title: "Old migration cleanup", hours: 1 })],
      [old],
      [rule(3, "phrase", "old migration")],
      new Map(),
      new Map([[3, "added"]]),
    );
    expect(table.rows.map((row) => [row.name, row.added])).toEqual([["Old migration", false]]);
  });
});

describe("previewRule", () => {
  it("counts matches across weeks and how many are Unsorted now", () => {
    const weeks = [
      { items: [item({ key: "a", title: "Widget sync" }), item({ key: "b", title: "Widget fix" })] },
      { items: [item({ key: "c", title: "Gadget" })] },
    ];
    expect(previewRule({ type: "phrase", value: "widget" }, weeks, [], new Map([["a", 1]]))).toEqual({
      matches: 2,
      unsorted: 1,
      weeks: 1,
      examples: ["Widget sync", "Widget fix"],
    });
  });
});

describe("activities", () => {
  it("keys each activity like its items row and leaves out what is not activity", () => {
    const ok = <T>(data: T) => ({ ok: true, fetchedAt: "2026-09-11T00:00:00Z", data });
    const week: WeekData = {
      from: MONDAY,
      to: "2026-09-11",
      generatedAt: "2026-09-11T00:00:00Z",
      harvest: ok([{ id: "77", day: "2026-09-08", task: "Development", hours: 1, notes: "#12: Widget sync" }]),
      github: ok({
        authored: [{
          number: 12, title: "Widget sync", url: "https://github.com/acme/widgets/pull/12",
          state: "merged", createdAt: "2026-08-28T10:00:00Z", closedAt: "2026-09-09T18:00:00Z", isDraft: false,
        }],
        reviewed: [],
        issuesCreated: [],
        issuesAssigned: [{
          number: 3, title: "Gadget bug", url: "https://github.com/acme/gadgets/issues/3",
          createdAt: "2026-08-01T00:00:00Z", labels: [],
        }],
      }),
      todoist: ok({ completed: [], incomplete: [] }),
      docs: ok([]),
    };
    const found = activities(week);
    expect(found.map((a) => [a.key, a.day, a.ref, a.title])).toEqual([
      ["harvest:entry:77", "2026-09-08", 12, "Widget sync"],
      // Opened before the week, so it sits on the day it merged.
      ["github:authored:12", "2026-09-09", 12, "Widget sync"],
    ]);
  });
});

describe("createWorkstreamStore", () => {
  function store() {
    const db = new Database(":memory:");
    for (const statement of MIGRATIONS) db.exec(statement);
    return createWorkstreamStore(db);
  }

  it("keeps names unique without regard to case and refuses a duplicate rule", () => {
    const workstreams = store();
    const first = workstreams.create("Widget sync", "2026-09-08T00:00:00Z");
    expect(workstreams.create("widget SYNC", "2026-09-08T00:00:00Z").id).toBe(first.id);
    workstreams.addRule(first.id, "phrase", "widget", "2026-09-08T00:00:00Z");
    const second = workstreams.create("Gadgets", "2026-09-08T00:00:00Z");
    expect(() => workstreams.addRule(second.id, "phrase", "Widget", "2026-09-08T00:00:00Z")).toThrow(
      /already exists/,
    );
  });

  it("records assignments, including to nothing, and week choices", () => {
    const workstreams = store();
    const widget = workstreams.create("Widget sync", "2026-09-08T00:00:00Z");
    workstreams.assign("harvest:entry:1", widget.id, "2026-09-08T00:00:00Z");
    workstreams.assign("harvest:entry:2", null, "2026-09-08T00:00:00Z");
    expect([...workstreams.assignments()]).toEqual([
      ["harvest:entry:1", widget.id],
      ["harvest:entry:2", null],
    ]);
    workstreams.setChoice(MONDAY, widget.id, "hidden");
    expect(workstreams.choices(MONDAY).get(widget.id)).toBe("hidden");
    workstreams.setChoice(MONDAY, widget.id, null);
    expect(workstreams.choices(MONDAY).size).toBe(0);
    expect(workstreams.find(String(widget.id))?.name).toBe("Widget sync");
    expect(workstreams.find("widget sync")?.id).toBe(widget.id);
  });
});

describe("createWorkstreamService", () => {
  it("accepting a suggested theme sorts this week and adds rules for later weeks", async () => {
    const { createWeekStore } = await import("./db.js");
    const { createWorkstreamService } = await import("./workstream-service.js");
    const db = new Database(":memory:");
    for (const statement of MIGRATIONS) db.exec(statement);
    const weeks = createWeekStore(db);
    const id = weeks.startGather(MONDAY, "2026-09-11", "manual", "2026-09-11T00:00:00Z");
    weeks.writeItems(MONDAY, "harvest", [
      { id: "1", day: "2026-09-08", task: "Planning", hours: 1, notes: "Gadget launch plan" },
      { id: "2", day: "2026-09-09", task: "Planning", hours: 0.5, notes: "Gadget launch plan" },
      { id: "3", day: "2026-09-09", task: "Code Review", hours: 0.5, notes: "#12: Review" },
    ], "2026-09-11T00:00:00Z");
    weeks.finishGather(id, [{ name: "Harvest", ok: true, millis: 1 }], "2026-09-11T00:00:00Z");

    const service = createWorkstreamService(weeks, createWorkstreamStore(db));
    const before = service.view(MONDAY);
    expect(before.suggestions.map((s) => [s.name, s.rules])).toEqual([
      ["Gadget launch plan", [{ type: "phrase", value: "Gadget launch plan" }]],
      ["Code review", [{ type: "task", value: "Code Review" }]],
    ]);

    service.acceptSuggestion(MONDAY, "Gadget launch plan");
    const after = service.view(MONDAY);
    expect(after.table?.rows.map((row) => [row.name, row.total.hours])).toEqual([["Gadget launch plan", 1.5]]);
    expect(after.suggestions.map((s) => s.name)).toEqual(["Code review"]);
    expect(service.run("unsorted", [MONDAY], MONDAY).stdout).toContain("harvest:entry:3");
    expect(service.run("rule", ["add", "Gadget launch plan", "ref", "12"], MONDAY).stdout).toContain(
      "matches 1 across 1 weeks",
    );
    expect(service.run("table", [MONDAY], MONDAY).stdout).toBe(
      "Gadget launch plan: 2h, 100% of the hours\n  Tue, Sep 8  1h\n  Wed, Sep 9  1h",
    );
  });
});

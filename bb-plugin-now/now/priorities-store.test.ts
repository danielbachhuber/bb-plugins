import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";

import { createPriorityStore } from "./priorities-store.js";
import { MIGRATIONS } from "./store.js";

function store() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createPriorityStore(db as never);
}

const write = {
  monday: "2026-10-05",
  source: "weekly-review",
  heading: "From October 2, 2026",
  hoursAt: "2026-10-06T13:00:00.000Z",
  items: [
    { text: "Ship the widget export", details: [], hours: 6.5 },
    { text: "People", details: ["1:1 prep for octocat"], hours: null },
  ],
};

describe("priority store", () => {
  test("reads nothing for a week never written", () => {
    expect(store().read("2026-10-05")).toBeNull();
  });

  test("reads back what was written", () => {
    const priorities = store();
    priorities.write(write, new Date("2026-10-06T13:01:00.000Z"));
    expect(priorities.read("2026-10-05")).toEqual({
      monday: "2026-10-05",
      source: "weekly-review",
      heading: "From October 2, 2026",
      hoursAt: "2026-10-06T13:00:00.000Z",
      writtenAt: "2026-10-06T13:01:00.000Z",
      items: [
        { text: "Ship the widget export", details: [], hours: 6.5, doneAt: null },
        { text: "People", details: ["1:1 prep for octocat"], hours: null, doneAt: null },
      ],
    });
  });

  test("keeps a checked priority checked through a rewrite", () => {
    const priorities = store();
    priorities.write(write, new Date("2026-10-06T07:00:00.000Z"));
    expect(priorities.setDone("2026-10-05", "Ship the widget export", true, new Date("2026-10-06T09:00:00.000Z"))).toBe(true);
    priorities.write(
      { ...write, items: [{ ...write.items[0]!, hours: 8 }, { text: "People and hiring", details: [], hours: 1 }] },
      new Date("2026-10-06T13:00:00.000Z"),
    );
    expect(priorities.read("2026-10-05")!.items).toEqual([
      { text: "Ship the widget export", details: [], hours: 8, doneAt: "2026-10-06T09:00:00.000Z" },
      { text: "People and hiring", details: [], hours: 1, doneAt: null },
    ]);
  });

  test("unchecks", () => {
    const priorities = store();
    priorities.write(write, new Date("2026-10-06T07:00:00.000Z"));
    priorities.setDone("2026-10-05", "People", true, new Date("2026-10-06T09:00:00.000Z"));
    priorities.setDone("2026-10-05", "People", false, new Date("2026-10-06T10:00:00.000Z"));
    expect(priorities.read("2026-10-05")!.items[1]!.doneAt).toBeNull();
  });

  test("reports a priority that is not there", () => {
    const priorities = store();
    expect(priorities.setDone("2026-10-05", "People", true, new Date())).toBe(false);
    priorities.write(write, new Date("2026-10-06T07:00:00.000Z"));
    expect(priorities.setDone("2026-10-05", "Someone else", true, new Date())).toBe(false);
  });

  test("keeps weeks apart", () => {
    const priorities = store();
    priorities.write(write, new Date("2026-10-06T07:00:00.000Z"));
    priorities.write({ ...write, monday: "2026-10-12", items: [] }, new Date("2026-10-13T07:00:00.000Z"));
    expect(priorities.read("2026-10-05")!.items).toHaveLength(2);
    expect(priorities.read("2026-10-12")!.items).toHaveLength(0);
  });
});

import { describe, expect, test } from "vitest";

import { partitionSnoozed, snoozeChoices } from "./snooze.js";
import type { Item } from "./types.js";

function item(id: string, activityAt: string | null = null): Item {
  return {
    id, source: "gmail", title: id, description: "", priority: null, due: null, deadline: null,
    activityAt, context: null, tags: [], url: "https://example.com", gmail: null, github: null,
  };
}

describe("snoozeChoices", () => {
  test("offers three hours, tomorrow morning, and next Monday morning", () => {
    // Thursday, September 24, 2026, 9:30 local.
    const [later, tomorrow, week] = snoozeChoices(new Date(2026, 8, 24, 9, 30));
    expect(new Date(later!.until)).toEqual(new Date(2026, 8, 24, 12, 30));
    expect(new Date(tomorrow!.until)).toEqual(new Date(2026, 8, 25, 8, 0));
    expect(new Date(week!.until)).toEqual(new Date(2026, 8, 28, 8, 0));
  });

  test("makes next week a week away on a Monday", () => {
    const [, , week] = snoozeChoices(new Date(2026, 8, 28, 9, 0));
    expect(new Date(week!.until)).toEqual(new Date(2026, 9, 5, 8, 0));
  });
});

describe("partitionSnoozed", () => {
  const now = new Date("2026-09-24T09:30:00.000Z");

  test("hides a snoozed item until its snooze runs out", () => {
    const snoozes = new Map([
      ["a", { until: "2026-09-25T08:00:00.000Z", activityAt: null }],
      ["b", { until: "2026-09-24T09:00:00.000Z", activityAt: null }],
    ]);
    const { active, snoozed } = partitionSnoozed([item("a"), item("b"), item("c")], snoozes, now);
    expect(active.map((kept) => kept.id)).toEqual(["b", "c"]);
    expect(snoozed).toEqual([{ item: item("a"), until: "2026-09-25T08:00:00.000Z" }]);
  });

  test("brings an item back when it has activity newer than the snooze", () => {
    const snoozes = new Map([["a", { until: "2026-09-25T08:00:00.000Z", activityAt: "2026-09-24T08:00:00.000Z" }]]);
    expect(partitionSnoozed([item("a", "2026-09-24T08:00:00.000Z")], snoozes, now).snoozed).toHaveLength(1);
    expect(partitionSnoozed([item("a", "2026-09-24T09:15:00.000Z")], snoozes, now).active).toHaveLength(1);
  });
});

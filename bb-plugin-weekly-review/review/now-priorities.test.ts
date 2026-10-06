import { describe, expect, it } from "vitest";

import { markDone, prioritiesForNow } from "./now-priorities.js";
import type { Cell } from "./workstreams.js";

function cell(hours: number, keys: string[]): Cell {
  return { hours, counts: { pr: 0, review: 0, issue: 0, task: 0 }, keys };
}

const rows = [
  { workstreamId: 1, total: cell(4, ["harvest:1", "harvest:2"]) },
  { workstreamId: 2, total: cell(2.5, ["harvest:3"]) },
  { workstreamId: 3, total: cell(0, []) },
  { workstreamId: 4, total: cell(0, ["github:pr:12"]) },
];

const priority = (text: string, links: number[], details: Array<{ text: string; depth: number }> = []) => ({ text, details, links, suggested: [] });

describe("prioritiesForNow", () => {
  it("sums the hours of each priority's linked workstreams", () => {
    expect(prioritiesForNow([priority("Ship the widget export", [1, 2])], rows)).toEqual([
      { text: "Ship the widget export", details: [], hours: 6.5 },
    ]);
  });

  it("gives null to a priority with no link, since nothing measures it", () => {
    expect(prioritiesForNow([priority("People", [], [{ text: "1:1 prep for octocat", depth: 1 }])], rows)).toEqual([
      { text: "People", details: [{ text: "1:1 prep for octocat", depth: 1 }], hours: null },
    ]);
  });

  it("gives 0 to a linked priority whose workstreams had nothing this week", () => {
    expect(prioritiesForNow([priority("Plan the fall talk series", [3])], rows)[0]!.hours).toBe(0);
  });

  it("gives 0 for a linked workstream missing from the table", () => {
    expect(prioritiesForNow([priority("Plan the fall talk series", [9])], rows)[0]!.hours).toBe(0);
  });

  it("gives null, not 0, when there was activity but no hours, so Now does not say no time", () => {
    expect(prioritiesForNow([priority("Review the gadgets pull request", [4])], rows)[0]!.hours).toBeNull();
  });

  it("rounds to two places", () => {
    const thirds = [{ workstreamId: 1, total: cell(1 / 3, ["a"]) }, { workstreamId: 2, total: cell(1 / 3, ["b"]) }];
    expect(prioritiesForNow([priority("Thirds", [1, 2])], thirds)[0]!.hours).toBe(0.67);
  });
});

describe("markDone", () => {
  const view = { heading: "From October 2, 2026", items: [priority("One", []), priority("Two", [])] };

  it("marks the priorities Now has checked", () => {
    expect(markDone(view, new Set(["Two"]))!.items.map((each) => each.done)).toEqual([false, true]);
  });

  it("marks none when Now could not be asked", () => {
    expect(markDone(view, null)!.items.map((each) => each.done)).toEqual([false, false]);
  });

  it("leaves no priorities as none", () => {
    expect(markDone(null, new Set(["One"]))).toBeNull();
  });
});

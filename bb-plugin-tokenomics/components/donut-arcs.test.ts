import { describe, expect, it } from "vitest";

import { donutArcs } from "./goal-line";

describe("donutArcs", () => {
  const circumference = 100;
  const stroke = 2;

  it("sizes grouped entries by their items and fills them by their counts", () => {
    const arcs = donutArcs(
      ["current", "current", "todo"],
      [{ done: 6, total: 9 }, { done: 3, total: 14 }, { done: 0, total: 7 }],
      circumference,
      stroke,
    );
    const gap = stroke * 0.9;
    const available = circumference - gap * 3;
    expect(arcs.map((arc) => arc.length)).toEqual([available * (9 / 30), available * (14 / 30), available * (7 / 30)].map((n) => expect.closeTo(n, 6)));
    expect(arcs.map((arc) => arc.filled)).toEqual([6 / 9, 3 / 14, 0]);
    // The filled share of the ring is the share of items done: 9 of 30.
    const filled = arcs.reduce((sum, arc) => sum + arc.length * arc.filled, 0);
    expect(filled / available).toBeCloseTo(9 / 30, 6);
  });

  it("gives an entry without a count one item, and fills done and dropped entries whole", () => {
    const arcs = donutArcs(["done", "dropped", "todo"], [{ done: 9, total: 9 }, undefined, null], circumference, stroke);
    expect(arcs.map((arc) => arc.length / arcs[1]!.length)).toEqual([9, 1, 1].map((n) => expect.closeTo(n, 6)));
    expect(arcs.map((arc) => arc.filled)).toEqual([1, 1, 0]);
  });

  it("splits the ring evenly when no entry has a count", () => {
    const arcs = donutArcs(["done", "todo", "todo", "todo"], [], circumference, stroke);
    expect(new Set(arcs.map((arc) => arc.length.toFixed(6))).size).toBe(1);
    expect(arcs[1]!.start - arcs[0]!.start).toBeCloseTo(arcs[0]!.length + stroke * 0.9, 6);
  });
});

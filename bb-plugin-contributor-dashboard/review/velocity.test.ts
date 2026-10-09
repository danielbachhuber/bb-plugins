import { describe, expect, it } from "vitest";

import { foldRows, peakOf, totalRow, type VelocityRow } from "./velocity";

const row = (login: string, first: number[], second: number[]): VelocityRow => ({
  login,
  first,
  second,
  firstTotal: first.reduce((a, b) => a + b, 0),
  secondTotal: second.reduce((a, b) => a + b, 0),
});

describe("foldRows", () => {
  it("sorts busiest first, by both lines together", () => {
    const { charted } = foldRows([row("mona", [2, 2], [2, 2]), row("octocat", [9, 9], [9, 9])]);
    expect(charted.map((person) => person.login)).toEqual(["octocat", "mona"]);
  });

  it("breaks a tie on the name", () => {
    const { charted } = foldRows([row("octocat", [3], [3]), row("hubber", [3], [3])]);
    expect(charted.map((person) => person.login)).toEqual(["hubber", "octocat"]);
  });

  it("folds a person whose busiest week is under a tenth of the scale", () => {
    const { charted, folded } = foldRows([row("octocat", [20], [18]), row("mona", [1], [1])]);
    expect(charted.map((person) => person.login)).toEqual(["octocat"]);
    expect(folded.map((person) => person.login)).toEqual(["mona"]);
  });

  it("charts a person exactly on the tenth", () => {
    const { charted } = foldRows([row("octocat", [20], [0]), row("mona", [2], [0])]);
    expect(charted.map((person) => person.login)).toEqual(["octocat", "mona"]);
  });

  it("folds a person with nothing in the period, whatever the scale", () => {
    const { folded } = foldRows([row("octocat", [0], [0])]);
    expect(folded.map((person) => person.login)).toEqual(["octocat"]);
  });

  it("charts everyone when they are all the same size", () => {
    const { charted, folded } = foldRows([row("octocat", [4], [4]), row("mona", [4], [4])]);
    expect(charted).toHaveLength(2);
    expect(folded).toHaveLength(0);
  });

  it("reports the scale as the busiest bucket of anyone", () => {
    expect(foldRows([row("octocat", [3, 7], [2, 2]), row("mona", [1], [9])]).max).toBe(9);
  });

  it("has no scale and nothing to chart when there is nobody", () => {
    expect(foldRows([])).toEqual({ charted: [], folded: [], max: 0 });
  });
});

describe("peakOf", () => {
  it("takes the busiest bucket on either line", () => {
    expect(peakOf(row("octocat", [1, 4], [6, 2]))).toBe(6);
  });
});

describe("totalRow", () => {
  it("adds everyone's lines bucket by bucket", () => {
    const rows = [
      { login: "octocat", first: [1, 2], second: [0, 1], firstTotal: 3, secondTotal: 1 },
      { login: "hubber", first: [4, 0], second: [2, 2], firstTotal: 4, secondTotal: 4 },
    ];
    expect(totalRow(rows, "Everyone", 2)).toEqual({ login: "Everyone", first: [5, 2], second: [2, 3], firstTotal: 7, secondTotal: 5 });
  });
});

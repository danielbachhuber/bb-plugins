import { describe, expect, it } from "vitest";

import { matchEntries, matchPeople } from "./person-finder";

const EVERYONE = ["octocat", "hubber", "mona", "monalisa", "spacecat"];

describe("matchPeople", () => {
  it("offers the most recently active when nothing is typed", () => {
    expect(matchPeople(EVERYONE, " ")).toEqual(EVERYONE);
  });

  it("puts names starting with the text before names containing it", () => {
    expect(matchPeople(EVERYONE, "CAT")).toEqual(["octocat", "spacecat"]);
    expect(matchPeople(["spacecat", "catwoman"], "cat")).toEqual(["catwoman", "spacecat"]);
  });

  it("keeps each group in the order it arrived", () => {
    expect(matchPeople(EVERYONE, "mona")).toEqual(["mona", "monalisa"]);
  });
});

describe("matchEntries", () => {
  const TEAMS = ["widgets-team", "gadgets-team", "docs", "infra"];

  it("offers people first, then the first three teams, when nothing is typed", () => {
    expect(matchEntries(EVERYONE, TEAMS, "")).toEqual([
      ...EVERYONE.map((name) => ({ kind: "person", name })),
      { kind: "team", name: "widgets-team" },
      { kind: "team", name: "gadgets-team" },
      { kind: "team", name: "docs" },
    ]);
  });

  it("keeps a place for matching teams when many people match", () => {
    const many = Array.from({ length: 20 }, (_, i) => `team-fan-${i}`);
    const entries = matchEntries(many, TEAMS, "team");
    expect(entries).toHaveLength(8);
    expect(entries.filter((entry) => entry.kind === "team").map((entry) => entry.name)).toEqual(["widgets-team", "gadgets-team"]);
  });

  it("gives teams the room people leave", () => {
    expect(matchEntries(EVERYONE, TEAMS, "gadg")).toEqual([{ kind: "team", name: "gadgets-team" }]);
  });
});

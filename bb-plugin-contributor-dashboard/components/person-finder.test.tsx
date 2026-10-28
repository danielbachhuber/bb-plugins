import { describe, expect, it } from "vitest";

import { matchPeople } from "./person-finder";

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

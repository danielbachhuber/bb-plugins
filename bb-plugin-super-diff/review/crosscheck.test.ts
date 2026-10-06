import { describe, expect, it } from "vitest";
import { crossCheck } from "./crosscheck";

describe("crossCheck", () => {
  it("agrees when both list the same paths, in any order, with or without a trailing slash", () => {
    expect(crossCheck(["src/a.ts", "vendor/lib"], ["vendor/lib/", "src/a.ts"])).toEqual({ status: "agree", onlyBb: [], onlyHere: [], reason: null });
  });

  it("names the paths only one side lists", () => {
    expect(crossCheck(["src/a.ts", "src/b.ts"], ["src/a.ts", "docs/export.md"])).toEqual({
      status: "differ",
      onlyBb: ["docs/export.md"],
      onlyHere: ["src/b.ts"],
      reason: null,
    });
  });

  it("says why when bb gave no list", () => {
    expect(crossCheck(["src/a.ts"], { reason: "bb's list was cut short" })).toEqual({ status: "unavailable", onlyBb: [], onlyHere: [], reason: "bb's list was cut short" });
  });
});

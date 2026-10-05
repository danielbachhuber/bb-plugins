import { describe, expect, it } from "vitest";
import type { Gap, Scenario } from "../grouping";
import { coveredFeature, notCoveredFeature, type ResolvedStep } from "./feature";

const STEPS: Record<string, ResolvedStep[]> = {
  "a.test.ts:1.1": [{ id: "1.1", kind: "snapshot", code: 'archive("sprocket") toMatchSnapshot', value: '{\n  "archived": true,\n}' }],
  "a.test.ts:1.2": [{ id: "1.2", kind: "exact", code: "list().length toBe 1", value: null }],
  "a.test.ts:2": [{ id: "2.1", kind: "snapshot", code: 'archive("gadget") rejects toMatchSnapshot', value: '[Error: say """no"""]' }],
};
const resolve = (ref: string) => STEPS[ref] ?? null;

const SCENARIOS: Scenario[] = [
  {
    title: "A manager archives a widget",
    given: ["the seeded widgets", "MANAGER is signed in"],
    when: ["MANAGER archives Sprocket"],
    then: [
      { text: "it comes back archived", steps: ["a.test.ts:1.1"] },
      { text: "the list shrinks", steps: ["a.test.ts:1.2", "a.test.ts:9.9"] },
    ],
  },
  { title: "A member cannot", given: [], when: ["MEMBER archives Gadget"], then: [{ text: "the call is refused", steps: ["a.test.ts:2"] }] },
];

describe("coveredFeature", () => {
  it("writes the scenarios as a .feature file, with each recorded value as a docstring", () => {
    const { text, snapshots } = coveredFeature("Tests for archiving", SCENARIOS, resolve);
    expect(text).toBe(
      [
        "Feature: Tests for archiving",
        "",
        "  Scenario: A manager archives a widget",
        "    Given the seeded widgets",
        "    And MANAGER is signed in",
        "    When MANAGER archives Sprocket",
        "    Then it comes back archived  # snapshot only",
        '      # 1.1 archive("sprocket") toMatchSnapshot',
        '      """',
        "      {",
        '        "archived": true,',
        "      }",
        '      """',
        "    And the list shrinks  # asserted",
        "      # 1.2 list().length toBe 1",
        "      # a.test.ts:9.9 is no longer in the test",
        "",
        "  Scenario: A member cannot",
        "    When MEMBER archives Gadget",
        "    Then the call is refused  # snapshot only",
        '      # 2.1 archive("gadget") rejects toMatchSnapshot',
        '      """',
        '      [Error: say \\"\\"\\"no\\"\\"\\"]',
        '      """',
      ].join("\n"),
    );
    expect(snapshots).toBe(2);
  });
});

describe("notCoveredFeature", () => {
  const gap: Gap = {
    title: "Archiving a missing widget",
    reason: "untested",
    note: "The NOT_FOUND branch is never reached.",
    evidence: [{ path: "src/archive.ts", line: 23 }],
    given: ["no widget named ghost"],
    when: ["MANAGER archives ghost"],
    then: ["the call is refused", "nothing is stored"],
  };

  it("writes each gap as a tagged scenario with its note and evidence", () => {
    expect(notCoveredFeature([gap], undefined)).toBe(
      [
        "Feature: Not covered by these tests",
        "",
        "  @untested",
        "  Scenario: Archiving a missing widget",
        "    # The NOT_FOUND branch is never reached.",
        "    # src/archive.ts:23",
        "    Given no widget named ghost",
        "    When MANAGER archives ghost",
        "    Then the call is refused",
        "    And nothing is stored",
      ].join("\n"),
    );
  });

  it("says why nothing is missing", () => {
    expect(notCoveredFeature([], "Every branch is tried.")).toBe("Feature: Not covered by these tests\n\n  # Every branch is tried.");
  });
});

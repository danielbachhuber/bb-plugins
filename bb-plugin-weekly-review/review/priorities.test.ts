import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createWeekStore } from "./db.js";
import { entryIn, nextBullets, suggestLinks } from "./priorities.js";
import { MIGRATIONS } from "./sources.js";
import { createWorkstreamService } from "./workstream-service.js";
import { createWorkstreamStore } from "./workstream-store.js";

// The shape of a real entry: headed sections, then a Next list whose nested
// bullets belong to the one above them. Every word invented.
const JOURNAL = `## September 4, 2026

Done:
- Shipped the widget sync beta.

## September 11, 2026

Done:
- Wrote up the widget sync rollout.
  - It went well.

Reflections/Learnings:

Next:
- Start the gadget launch checklist.
- Finish the widget sync rollout.
- People:
  - Check in with Octocat and Hubber.

## September 18, 2026

Done:
- Nothing yet.
`;

describe("nextBullets", () => {
  it("reads the top-level bullets under Next, with what is nested under each", () => {
    const entry = entryIn(JOURNAL, "2026-09-07", "2026-09-13");
    expect(entry?.heading).toBe("September 11, 2026");
    expect(nextBullets(entry?.body ?? "")).toEqual([
      { text: "Start the gadget launch checklist.", details: [] },
      { text: "Finish the widget sync rollout.", details: [] },
      { text: "People:", details: [{ text: "Check in with Octocat and Hubber.", depth: 1 }] },
    ]);
  });

  it("stops at the next paragraph and finds nothing without a Next line", () => {
    expect(nextBullets("Next:\n- One\n- Two\n\nAfterwards, prose.\n- Not a priority")).toEqual([
      { text: "One", details: [] },
      { text: "Two", details: [] },
    ]);
    expect(nextBullets("Done:\n- Something")).toEqual([]);
  });

  it("keeps how deep each nested bullet sits", () => {
    const text = [
      "Next:",
      "- People:",
      "  - Octocat:",
      "    - Ask about the widget sync handoff.",
      "  - Hubber:",
      "    - Review the gadget launch plan.",
      "      - Before Friday.",
      "  - Plan the offsite.",
      "- Ship it",
    ].join("\n");
    expect(nextBullets(text)).toEqual([
      {
        text: "People:",
        details: [
          { text: "Octocat:", depth: 1 },
          { text: "Ask about the widget sync handoff.", depth: 2 },
          { text: "Hubber:", depth: 1 },
          { text: "Review the gadget launch plan.", depth: 2 },
          { text: "Before Friday.", depth: 3 },
          { text: "Plan the offsite.", depth: 1 },
        ],
      },
      { text: "Ship it", details: [] },
    ]);
  });

  it("accepts a bold Next heading", () => {
    expect(nextBullets("**Next:**\n* Ship it")).toEqual([{ text: "Ship it", details: [] }]);
  });
});

describe("suggestLinks", () => {
  it("suggests a workstream whose name or phrase rule appears in the bullet", () => {
    const workstreams = [
      { id: 1, name: "Widget sync", retiredAt: null, rules: [] },
      { id: 2, name: "Launch", retiredAt: null, rules: [{ id: 1, workstreamId: 2, type: "phrase" as const, value: "gadget launch" }] },
      { id: 3, name: "Old", retiredAt: "2026-01-01", rules: [] },
    ];
    expect(suggestLinks({ text: "Finish the widget sync rollout.", details: [] }, workstreams)).toEqual([1]);
    expect(suggestLinks({ text: "Start the gadget launch checklist.", details: [] }, workstreams)).toEqual([2]);
  });
});

describe("priorities and proposals in the service", () => {
  function setup() {
    const db = new Database(":memory:");
    for (const statement of MIGRATIONS) db.exec(statement);
    const weeks = createWeekStore(db);
    const monday = "2026-09-14";
    const id = weeks.startGather(monday, "2026-09-18", "manual", "2026-09-18T00:00:00Z");
    weeks.writeItems(monday, "harvest", [
      { id: "1", day: "2026-09-15", task: "Development", hours: 2, notes: "Widget sync rollout" },
      { id: "2", day: "2026-09-16", task: "Planning", hours: 1, notes: "Hiring loop" },
    ], "2026-09-18T00:00:00Z");
    weeks.finishGather(id, [{ name: "Harvest", ok: true, millis: 1 }], "2026-09-18T00:00:00Z");
    return { monday, service: createWorkstreamService(weeks, createWorkstreamStore(db)) };
  }

  it("takes priorities from the previous week's entry and shows a linked one with no time", () => {
    const { monday, service } = setup();
    expect(service.view(monday).priorities).toBeNull();
    expect(service.rememberJournal(JOURNAL)).toBe(true);
    expect(service.rememberJournal(JOURNAL)).toBe(false);

    const widget = service.create("Widget sync");
    service.addRule(widget.id, "phrase", "widget sync");
    const gadget = service.create("Gadget launch");

    const before = service.view(monday);
    expect(before.priorities?.heading).toBe("September 11, 2026");
    expect(before.priorities?.items.map((item) => [item.text, item.suggested])).toEqual([
      ["Start the gadget launch checklist.", [gadget.id]],
      ["Finish the widget sync rollout.", [widget.id]],
      ["People:", []],
    ]);

    service.link(monday, "Start the gadget launch checklist.", gadget.id);
    const after = service.view(monday);
    expect(after.table?.rows.map((row) => [row.name, row.planned, row.total.hours])).toEqual([
      ["Gadget launch", true, 0],
      ["Widget sync", false, 2],
    ]);
    expect(service.run("priorities", [monday], monday).stdout).toBe([
      "From September 11, 2026:",
      "1. Start the gadget launch checklist.  → Gadget launch (no time this week)",
      "2. Finish the widget sync rollout.  (not linked)",
      "3. People:  (not linked)",
    ].join("\n"));
  });

  it("previews a proposal, and accepting it creates the workstream and its rule", () => {
    const { monday, service } = setup();
    service.propose(monday, [
      { workstream: "Hiring", type: "phrase", value: "hiring", reason: "Interview loops" },
    ]);
    const [proposal] = service.view(monday).proposals;
    expect(proposal).toMatchObject({ workstream: "Hiring", isNew: true, preview: { matches: 1, unsorted: 1 } });

    service.acceptProposal(proposal.id);
    const view = service.view(monday);
    expect(view.proposals).toEqual([]);
    expect(view.table?.rows.map((row) => row.name)).toEqual(["Hiring"]);
    expect(() => service.acceptProposal(proposal.id)).toThrow(/No open proposal/);
  });
});

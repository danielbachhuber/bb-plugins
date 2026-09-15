import { describe, expect, it } from "vitest";
import { parseAutomations, parseProjects } from "./automations";

/**
 * Shaped like real `bb automation list --project <id> --json` output, down to
 * the fields this plugin ignores: an entry it cannot read is the failure worth
 * covering, and a payload trimmed to four fields would never produce one.
 */
const LIST_JSON = JSON.stringify([
  {
    id: "auto_widgetsweep",
    projectId: "proj_acme",
    name: "Widget sweep",
    enabled: true,
    trigger: { triggerType: "schedule", cron: "0 7 * * 1-5", timezone: "UTC" },
    execution: { mode: "script", interpreter: "bash", timeoutMs: 300_000 },
    runCount: 26,
    lastRunStatus: "succeeded",
  },
  {
    id: "auto_gadgetnotes",
    projectId: "proj_acme",
    name: "Gadget notes",
    enabled: false,
    trigger: { triggerType: "schedule", cron: "0 14 * * 1", timezone: "UTC" },
    execution: { mode: "agent", provider: "claude-code" },
    runCount: 3,
  },
]);

describe("parseAutomations", () => {
  it("keeps the fields a palette row needs and drops the rest", () => {
    expect(parseAutomations(LIST_JSON)).toEqual([
      {
        id: "auto_widgetsweep",
        projectId: "proj_acme",
        name: "Widget sweep",
        projectName: "",
        enabled: true,
      },
      {
        id: "auto_gadgetnotes",
        projectId: "proj_acme",
        name: "Gadget notes",
        projectName: "",
        enabled: false,
      },
    ]);
  });

  it("reads a missing enabled flag as enabled", () => {
    const [automation] = parseAutomations(
      JSON.stringify([{ id: "auto_a", projectId: "proj_acme", name: "Nightly" }]),
    );
    expect(automation?.enabled).toBe(true);
  });

  it("falls back to the id when the automation has no usable name", () => {
    const [automation] = parseAutomations(
      JSON.stringify([{ id: "auto_a", projectId: "proj_acme", name: "   " }]),
    );
    expect(automation?.name).toBe("auto_a");
  });

  it("collapses whitespace so a name cannot break the row onto two lines", () => {
    const [automation] = parseAutomations(
      JSON.stringify([{ id: "auto_a", projectId: "proj_acme", name: "Widget\n  sweep" }]),
    );
    expect(automation?.name).toBe("Widget sweep");
  });

  it("caps a very long name", () => {
    const [automation] = parseAutomations(
      JSON.stringify([{ id: "auto_a", projectId: "proj_acme", name: "w".repeat(200) }]),
    );
    expect(automation?.name).toHaveLength(80);
    expect(automation?.name.endsWith("…")).toBe(true);
  });

  it("drops an entry with no project, and keeps the readable ones", () => {
    const automations = parseAutomations(
      JSON.stringify([
        { id: "auto_a", name: "Orphan" },
        { id: "auto_b", projectId: "proj_acme", name: "Widget sweep" },
      ]),
    );
    expect(automations.map((automation) => automation.id)).toEqual(["auto_b"]);
  });

  it("drops an id that could not be a palette row id", () => {
    // Palette ids allow letters, digits, `-` and `_` only, and a duplicate or
    // malformed id would throw at registration and take out the whole app
    // bundle rather than one row.
    const automations = parseAutomations(
      JSON.stringify([{ id: "auto a/b", projectId: "proj_acme", name: "Widget sweep" }]),
    );
    expect(automations).toEqual([]);
  });

  it("keeps the first of two entries sharing an id", () => {
    const automations = parseAutomations(
      JSON.stringify([
        { id: "auto_a", projectId: "proj_acme", name: "First" },
        { id: "auto_a", projectId: "proj_acme", name: "Second" },
      ]),
    );
    expect(automations.map((automation) => automation.name)).toEqual(["First"]);
  });

  it("reads unparseable or unexpected output as no automations", () => {
    expect(parseAutomations("No automations found")).toEqual([]);
    expect(parseAutomations("{}")).toEqual([]);
    expect(parseAutomations("")).toEqual([]);
  });
});

describe("parseProjects", () => {
  it("takes id and name in the order the CLI reported them", () => {
    const json = JSON.stringify([
      { id: "proj_acme", kind: "standard", name: "Acme Widgets", sources: [] },
      { id: "proj_gadgets", kind: "standard", name: "Acme Gadgets", sources: [] },
    ]);
    expect(parseProjects(json)).toEqual([
      { id: "proj_acme", name: "Acme Widgets" },
      { id: "proj_gadgets", name: "Acme Gadgets" },
    ]);
  });

  it("keeps a project with no usable name, since its automations still run", () => {
    expect(parseProjects(JSON.stringify([{ id: "proj_acme" }]))).toEqual([
      { id: "proj_acme", name: "" },
    ]);
  });

  it("reads unparseable output as no projects", () => {
    expect(parseProjects("bb: command not found")).toEqual([]);
  });
});

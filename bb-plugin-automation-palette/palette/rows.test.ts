import { describe, expect, it } from "vitest";
import type { AutomationSummary } from "./automations";
import { paletteRows } from "./rows";

const widgetSweep: AutomationSummary = {
  id: "auto_widgetsweep",
  projectId: "proj_acme",
  name: "Widget sweep",
  projectName: "Acme Widgets",
  enabled: true,
};
const gadgetNotes: AutomationSummary = {
  id: "auto_gadgetnotes",
  projectId: "proj_gadgets",
  name: "Gadget notes",
  projectName: "Acme Gadgets",
  enabled: false,
};

describe("paletteRows", () => {
  it("names the verb, the automation, and its project, so any of them finds the row", () => {
    expect(paletteRows([widgetSweep])).toEqual([
      {
        id: "run-auto_widgetsweep",
        title: "Run automation: Widget sweep · Acme Widgets",
        automationId: "auto_widgetsweep",
        projectId: "proj_acme",
      },
    ]);
  });

  it("says when an automation is paused", () => {
    expect(paletteRows([gadgetNotes])[0]?.title).toBe(
      "Run automation: Gadget notes · Acme Gadgets (paused)",
    );
  });

  it("leaves the separator out when the project has no name", () => {
    expect(paletteRows([{ ...widgetSweep, projectName: "" }])[0]?.title).toBe(
      "Run automation: Widget sweep",
    );
  });

  it("orders by name so the list does not shuffle between loads", () => {
    expect(paletteRows([widgetSweep, gadgetNotes]).map((row) => row.automationId)).toEqual([
      "auto_gadgetnotes",
      "auto_widgetsweep",
    ]);
  });

  it("carries each automation's own project, which is where its run is queued", () => {
    expect(paletteRows([widgetSweep, gadgetNotes]).map((row) => row.projectId)).toEqual([
      "proj_gadgets",
      "proj_acme",
    ]);
  });

  it("gives every row a distinct id", () => {
    const rows = paletteRows([widgetSweep, gadgetNotes]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it("has nothing to show before the first snapshot", () => {
    expect(paletteRows([])).toEqual([]);
  });
});

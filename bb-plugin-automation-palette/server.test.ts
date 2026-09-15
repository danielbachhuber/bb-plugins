import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { BbUnavailableError, type BbRunner } from "./palette/cli";
import plugin from "./server";

const PROJECTS = JSON.stringify([
  { id: "proj_acme", name: "Acme Widgets" },
  { id: "proj_gadgets", name: "Acme Gadgets" },
]);

const ACME_AUTOMATIONS = JSON.stringify([
  { id: "auto_widgetsweep", projectId: "proj_acme", name: "Widget sweep", enabled: true },
]);
const GADGET_AUTOMATIONS = JSON.stringify([
  { id: "auto_gadgetnotes", projectId: "proj_gadgets", name: "Gadget notes", enabled: false },
]);

/** A runner that answers from a table and records what it was asked. */
function fakeRunner(answers: (args: string[]) => string | Promise<string>) {
  const calls: string[][] = [];
  const runner: BbRunner = {
    run: async (args) => {
      calls.push(args);
      return answers(args);
    },
  };
  return { runner, calls };
}

function answerListCalls(args: string[]): string {
  if (args[0] === "project") return PROJECTS;
  if (args.includes("proj_acme")) return ACME_AUTOMATIONS;
  if (args.includes("proj_gadgets")) return GADGET_AUTOMATIONS;
  return "[]";
}

async function start(runner: BbRunner) {
  const host = createFakePluginHost({ pluginId: "automation-palette" });
  await plugin(host.bb, { runner });
  return host;
}

describe("automations_list", () => {
  it("gathers every project's automations and attaches each project's name", async () => {
    const { runner, calls } = fakeRunner(answerListCalls);
    const { harness } = await start(runner);

    const listed = await harness.behavior.callRpc("automations_list", null);

    expect(listed).toEqual({
      automations: [
        {
          id: "auto_widgetsweep",
          projectId: "proj_acme",
          name: "Widget sweep",
          projectName: "Acme Widgets",
          enabled: true,
        },
        {
          id: "auto_gadgetnotes",
          projectId: "proj_gadgets",
          name: "Gadget notes",
          projectName: "Acme Gadgets",
          enabled: false,
        },
      ],
      error: null,
    });
    expect(calls).toEqual([
      ["project", "list", "--json"],
      ["automation", "list", "--project", "proj_acme", "--json"],
      ["automation", "list", "--project", "proj_gadgets", "--json"],
    ]);
  });

  it("reports a CLI failure instead of latching the plugin into needs-configuration", async () => {
    const { runner } = fakeRunner(() => {
      throw new BbUnavailableError("`bb` was not found.", "spawn ENOENT");
    });
    const { harness } = await start(runner);

    const listed = await harness.behavior.callRpc("automations_list", null);

    expect(listed).toEqual({ automations: [], error: "`bb` was not found." });
    expect(harness.inspection.needsConfigurationMessages).toEqual([]);
  });
});

describe("automations_run", () => {
  it("runs the automation in its own project", async () => {
    const { runner, calls } = fakeRunner(() => "Queued run for Widget sweep.\n");
    const { harness } = await start(runner);

    const result = await harness.behavior.callRpc("automations_run", {
      automationId: "auto_widgetsweep",
      projectId: "proj_acme",
    });

    expect(result).toEqual({ started: true, message: "Queued run for Widget sweep." });
    expect(calls).toEqual([
      ["automation", "run", "auto_widgetsweep", "--project", "proj_acme"],
    ]);
  });

  it("hands back why a run did not start", async () => {
    const { runner } = fakeRunner(() => {
      throw new BbUnavailableError("Automation not found.", "Automation not found.");
    });
    const { harness } = await start(runner);

    const result = await harness.behavior.callRpc("automations_run", {
      automationId: "auto_missing",
      projectId: "proj_acme",
    });

    expect(result).toEqual({ started: false, message: "Automation not found." });
  });
});

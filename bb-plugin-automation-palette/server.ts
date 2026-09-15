// bb-plugin-automation-palette — backend entry.
//
// Two RPC methods over the `bb` CLI: what automations exist, and run one. The
// palette rows themselves are a frontend concern (app.tsx), because bb collects
// them from the app bundle; this side only answers questions and starts runs.
//
// Automations live in bb's own automations plugin and the SDK exposes no API
// for them, so the CLI is the seam. palette/cli.ts owns the spawn and
// palette/automations.ts owns the parsing, which leaves this file as the wire
// contract.
import { existsSync } from "node:fs";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { parseAutomations, parseProjects, type AutomationSummary } from "./palette/automations";
import { BbUnavailableError, createBbRunner, resolveBbPath, type BbRunner } from "./palette/cli";

const automationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  projectName: z.string(),
  enabled: z.boolean(),
});

/** `auto_...` and `proj_...`; bounded so a hostile client cannot send an essay. */
const idSchema = z.string().trim().min(1).max(200);

export const rpcContract = defineRpcContract({
  automations_list: {
    input: z.null(),
    output: z.object({
      automations: z.array(automationSchema),
      /**
       * Why the list is empty or short, when that is not the answer. The
       * content script logs it: an empty palette with nothing in the console
       * is the failure that wastes an afternoon.
       */
      error: z.string().nullable(),
    }),
  },
  automations_run: {
    input: z.object({ automationId: idSchema, projectId: idSchema }).strict(),
    output: z.object({
      started: z.boolean(),
      /** The CLI's own words, trimmed — shown in the console, not the UI. */
      message: z.string(),
    }),
  },
});

/**
 * Every project's automations, in one list, each carrying its project's name.
 *
 * Every project, not the current one: a palette row is registered once for the
 * whole app and listed everywhere, so the frontend needs the full set up front
 * and never has to learn which project it is in. The project name comes from
 * `bb project list`, since `bb automation list` reports only the id, and the
 * row's title is where it is needed.
 */
export async function fetchAutomations(bb: BbRunner): Promise<AutomationSummary[]> {
  const projects = parseProjects(await bb.run(["project", "list", "--json"]));
  const automations: AutomationSummary[] = [];
  for (const project of projects) {
    const stdout = await bb.run(["automation", "list", "--project", project.id, "--json"]);
    for (const automation of parseAutomations(stdout)) {
      automations.push({ ...automation, projectName: project.name });
    }
  }
  return automations;
}

/**
 * Test seam. The real host calls the factory with the plugin API alone; a test
 * passes a runner instead of letting the plugin spawn the CLI it found.
 */
export interface PluginDeps {
  runner?: BbRunner;
}

export default async function plugin(bb: BbPluginApi, deps: PluginDeps = {}) {
  bb.log.info("loaded");

  const settings = bb.settings.define({
    bbPath: {
      type: "string",
      label: "Path to the bb CLI",
      description:
        "Left empty, the plugin uses the path bb injects, then PATH, then the usual install locations.",
      default: "",
    },
  });
  const { bbPath: configured } = await settings.get();

  const bbPath = resolveBbPath({
    configured: typeof configured === "string" ? configured : undefined,
    envPath: process.env.BB_CLI,
    exists: existsSync,
  });
  const runner = deps.runner ?? createBbRunner(bbPath);
  if (deps.runner === undefined) bb.log.info(`using bb CLI at ${bbPath}`);

  /**
   * A CLI failure is reported, never latched.
   *
   * `bb.status.needsConfiguration` is one-way — the SDK offers no runtime way
   * back — and this plugin's whole surface is a set of palette rows. Losing
   * them over one timed-out `bb` call would be worse than an error in the
   * console.
   */
  function describe(error: unknown): string {
    if (error instanceof BbUnavailableError) return error.message;
    return error instanceof Error ? error.message : String(error);
  }

  bb.rpc.register(rpcContract, {
    automations_list: async () => {
      try {
        return { automations: await fetchAutomations(runner), error: null };
      } catch (error) {
        const message = describe(error);
        bb.log.warn(`listing automations failed: ${message}`);
        return { automations: [], error: message };
      }
    },
    automations_run: async ({ automationId, projectId }) => {
      try {
        const stdout = await runner.run([
          "automation",
          "run",
          automationId,
          "--project",
          projectId,
        ]);
        bb.log.info(`ran automation ${automationId}`);
        return { started: true, message: stdout.trim() };
      } catch (error) {
        const message = describe(error);
        bb.log.warn(`running automation ${automationId} failed: ${message}`);
        return { started: false, message };
      }
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}

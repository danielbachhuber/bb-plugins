// bb-plugin-automation-palette — frontend entry.
//
// No React slot: the whole plugin is rows in bb's quick palette, which is
// host-rendered chrome. `setup` registers one row per automation in the
// snapshot, and a content script refreshes that snapshot for the next load.
//
// The two-step exists because the host collects palette registrations once per
// app interpretation from a synchronous `setup`, then memoizes them. Rows
// cannot be fetched while the palette is open, so the only way to list real
// automations is to already know them.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { parseAutomations } from "./palette/automations";
import { paletteRows } from "./palette/rows";
import { readSnapshot, sameAutomations, writeSnapshot } from "./palette/snapshot";
import type { rpcContract } from "./server";

type RpcMethod = keyof typeof rpcContract;

/**
 * The plugin's id, which the palette callbacks are not handed.
 *
 * The content script is, so it corrects this at mount; the constant is what a
 * row clicked before any script mounted would use. Both agree in practice —
 * the id comes from the package name — and a wrong one would 404 loudly rather
 * than run the wrong thing.
 */
let pluginId = "automation-palette";

/**
 * A content script and a palette callback both run outside React, so neither
 * gets `useRpc`. The route is same-origin and the app shell is already
 * authenticated for it.
 */
async function callRpc<Result>(method: RpcMethod, input: unknown): Promise<Result> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/${encodeURIComponent(method)}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  const envelope = body as { ok?: boolean; result?: Result };
  if (!response.ok || envelope?.ok !== true || envelope.result === undefined) {
    throw new Error(`${method} failed (${response.status})`);
  }
  return envelope.result;
}

/** `localStorage`, or nothing where it is unavailable (a storage-blocked tab). */
function snapshotStore(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export default definePluginApp((app) => {
  const registered = readSnapshot(snapshotStore());

  for (const row of paletteRows(registered)) {
    app.slots.commandPaletteAction({
      id: row.id,
      title: row.title,
      // No `isAvailable`: the row is listed wherever the palette opens, and
      // the run is queued in the automation's own project regardless.
      run: async () => {
        // Errors here are contained and logged by the host, and the palette has
        // no way to report back, so the console is the only channel. The run
        // itself is visible on the Automations page.
        const result = await callRpc<{ started: boolean; message: string }>("automations_run", {
          automationId: row.automationId,
          projectId: row.projectId,
        });
        if (!result.started) {
          console.warn(`[automation-palette] ${row.title}: ${result.message}`);
          return;
        }
        console.info(`[automation-palette] started ${row.title}`);
      },
    });
  }

  app.contentScripts.register({
    id: "automation-snapshot",
    async mount(context) {
      pluginId = context.pluginId;

      const result = await callRpc<{ automations: unknown; error: string | null }>(
        "automations_list",
        null,
      );
      if (context.signal.aborted) return;

      if (result.error !== null) {
        console.warn(`[automation-palette] ${result.error}`);
        return;
      }

      // Back through the parser rather than trusting the wire shape: the
      // snapshot is read again next load, where a bad entry would cost a row.
      const automations = parseAutomations(JSON.stringify(result.automations));
      writeSnapshot(snapshotStore(), automations);

      if (!sameAutomations(registered, automations)) {
        console.info(
          "[automation-palette] the automation list changed; reload bb to update the palette rows.",
        );
      }
    },
  });
});

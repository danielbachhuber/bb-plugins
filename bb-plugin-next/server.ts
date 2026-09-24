// bb-plugin-next — what to do next, gathered from every configured source.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { rpcContract } from "./next/contract.js";
import { loadSources, type Source } from "./next/sources.js";
import { CONFIGURE_HINT, DEFAULT_FILTER, todoistSource } from "./todoist/source.js";

export { rpcContract } from "./next/contract.js";

export interface PluginDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

/** The plugin factory, with its I/O injected so it is testable without a network. */
export function createPlugin(deps: PluginDeps = {}) {
  const now = deps.now ?? (() => new Date());

  return async function plugin(bb: BbPluginApi) {
    const settings = bb.settings.define({
      todoistApiToken: {
        type: "string",
        label: "Todoist API token",
        description: "From Todoist's Settings → Integrations → Developer.",
        secret: true,
      },
      todoistFilter: {
        type: "string",
        label: "Todoist filter",
        description: 'A Todoist filter query, such as "today | overdue" or "#Work & p1".',
        default: DEFAULT_FILTER,
      },
    });

    // Read here only to decide the load-time status. The handler re-reads, so
    // a new token or filter takes effect on the next refresh.
    const initial = await settings.get();
    if (!initial.todoistApiToken) bb.status.needsConfiguration(CONFIGURE_HINT);

    async function sources(): Promise<Source[]> {
      const values = await settings.get();
      return [
        todoistSource({ token: values.todoistApiToken, filter: values.todoistFilter, fetch: deps.fetch }),
      ];
    }

    bb.rpc.register(rpcContract, {
      items_list: async () =>
        loadSources(await sources(), now(), (source, message) => {
          bb.log.warn(`Could not load ${source.name}: ${message}`);
        }),
    });
  };
}

export default createPlugin();

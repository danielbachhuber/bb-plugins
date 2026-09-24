// Todoist as a Next source: the open tasks matching one filter query.
import type { Source } from "../next/sources.js";
import { unconfiguredSource } from "../next/sources.js";
import { createTodoistApi } from "./api.js";
import { normalizeTasks, projectNameMap, SOURCE_ID } from "./normalize.js";

export const DEFAULT_FILTER = "today | overdue";
const NAME = "Todoist";

export interface TodoistSourceOptions {
  token: string | undefined;
  filter: string | undefined;
  fetch?: typeof fetch;
}

export const CONFIGURE_HINT =
  "Set todoistApiToken with `bb plugin config next set todoistApiToken <token>`. " +
  "Find the token in Todoist under Settings → Integrations → Developer.";

export function todoistSource(options: TodoistSourceOptions): Source {
  if (!options.token) return unconfiguredSource(SOURCE_ID, NAME, CONFIGURE_HINT);

  const filter = options.filter?.trim() || DEFAULT_FILTER;
  const api = createTodoistApi({ token: options.token, fetch: options.fetch });

  return {
    id: SOURCE_ID,
    name: NAME,
    query: filter,
    async load() {
      const [tasks, projects] = await Promise.all([api.filterTasks(filter), api.projects()]);
      const items = normalizeTasks(tasks, projectNameMap(projects));
      return {
        status: { id: SOURCE_ID, name: NAME, state: "ok", query: filter, count: items.length },
        items,
      };
    },
  };
}

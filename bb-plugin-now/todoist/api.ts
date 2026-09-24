// The one module that talks to Todoist. Everything it returns is raw payload;
// tasks.ts turns that into rows.

const BASE_URL = "https://api.todoist.com/api/v1";
/** The endpoint's maximum page size. */
const PAGE_LIMIT = 200;
/** A backstop against a cursor that never ends, far past any real task list. */
const MAX_PAGES = 50;

export class TodoistError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "TodoistError";
  }
}

export interface TodoistApi {
  /** Every open task matching a Todoist filter query. */
  filterTasks(query: string): Promise<unknown[]>;
  projects(): Promise<unknown[]>;
  /** Completes a task; a recurring one moves to its next date. */
  close(taskId: string): Promise<void>;
  reopen(taskId: string): Promise<void>;
}

export interface TodoistApiOptions {
  token: string;
  fetch?: typeof fetch;
}

/**
 * Todoist answers a bad filter with a 400 whose body names the problem. Pass
 * that along, because "400" alone does not tell anyone to fix the filter. The
 * page puts the source's name in front, so the message leaves it out.
 */
async function errorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  let detail = body.trim();
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.error === "string") detail = parsed.error;
  } catch {}

  if (response.status === 401 || response.status === 403) {
    return "The API token was rejected. Check the todoistApiToken setting.";
  }
  return detail === "" ? `Returned ${response.status}.` : `Returned ${response.status}: ${detail}`;
}

export function createTodoistApi(options: TodoistApiOptions): TodoistApi {
  const fetchImpl = options.fetch ?? fetch;

  async function paginate(path: string, params: Record<string, string> = {}): Promise<unknown[]> {
    const results: unknown[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${BASE_URL}${path}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      url.searchParams.set("limit", String(PAGE_LIMIT));
      if (cursor !== null) url.searchParams.set("cursor", cursor);

      const response = await fetchImpl(url.toString(), {
        headers: { authorization: `Bearer ${options.token}` },
      });
      if (!response.ok) throw new TodoistError(await errorMessage(response), response.status);

      const body = (await response.json()) as { results?: unknown; next_cursor?: unknown };
      if (Array.isArray(body.results)) results.push(...body.results);
      cursor = typeof body.next_cursor === "string" && body.next_cursor !== "" ? body.next_cursor : null;
      if (cursor === null) return results;
    }

    return results;
  }

  async function post(path: string): Promise<void> {
    const response = await fetchImpl(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${options.token}` },
    });
    if (!response.ok) throw new TodoistError(await errorMessage(response), response.status);
  }

  return {
    filterTasks: (query) => paginate("/tasks/filter", { query }),
    projects: () => paginate("/projects"),
    close: (taskId) => post(`/tasks/${encodeURIComponent(taskId)}/close`),
    reopen: (taskId) => post(`/tasks/${encodeURIComponent(taskId)}/reopen`),
  };
}

import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, test, vi } from "vitest";

import type { NextList } from "./next/contract.js";
import { createPlugin } from "./server.js";
import { DEFAULT_FILTER } from "./todoist/source.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Route = unknown | { status: number; body: unknown };

/**
 * Route by path and query, so each test declares the endpoints it expects and
 * an unexpected call fails loudly.
 */
function routedFetch(routes: Record<string, Route>) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const target = new URL(url);
    const key = `${target.pathname}${target.search}`;
    if (!(key in routes)) throw new Error(`unexpected GET ${key}`);

    const route = routes[key] as Record<string, unknown>;
    if (typeof route.status === "number") return jsonResponse(route.body, route.status);
    return jsonResponse(route);
  });
}

function filterPath(query: string, cursor?: string) {
  const params = new URLSearchParams({ query, limit: "200" });
  if (cursor !== undefined) params.set("cursor", cursor);
  return `/api/v1/tasks/filter?${params}`;
}

const PROJECTS_PATH = "/api/v1/projects?limit=200";
const PROJECTS = { results: [{ id: "p1", name: "Widgets" }], next_cursor: null };

function rawTask(id: string, overrides: Record<string, unknown> = {}) {
  return { id, project_id: "p1", content: `Task ${id}`, description: "", priority: 1, labels: [], due: null, ...overrides };
}

function host(routes: Record<string, Route>, settings: Record<string, string> = { todoistApiToken: "tok" }) {
  const fetchImpl = routedFetch(routes);
  const created = createFakePluginHost({ pluginId: "next", settings });
  const plugin = createPlugin({
    fetch: fetchImpl as unknown as typeof fetch,
    now: () => new Date("2026-09-24T09:30:00Z"),
  });
  return { ...created, plugin, fetchImpl };
}

describe("configuration", () => {
  test("reports needing configuration without a token, and calls nothing", async () => {
    const { bb, harness, plugin, fetchImpl } = host({}, {});
    await plugin(bb);

    expect(harness.needsConfigurationMessages.join(" ")).toContain("bb plugin config next set todoistApiToken");
    await expect(harness.behavior.callRpc("items_list", null)).resolves.toMatchObject({
      items: [],
      sources: [{ id: "todoist", state: "unconfigured" }],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("loads cleanly with a token", async () => {
    const { bb, harness, plugin } = host({});
    await plugin(bb);

    expect(harness.needsConfigurationMessages).toHaveLength(0);
  });
});

describe("items_list", () => {
  test("uses the default filter and names each task's project", async () => {
    const { bb, harness, plugin, fetchImpl } = host({
      [filterPath(DEFAULT_FILTER)]: { results: [rawTask("a")], next_cursor: null },
      [PROJECTS_PATH]: PROJECTS,
    });
    await plugin(bb);

    const list = (await harness.behavior.callRpc("items_list", null)) as NextList;

    expect(list.fetchedAt).toBe("2026-09-24T09:30:00.000Z");
    expect(list.sources).toEqual([
      { id: "todoist", name: "Todoist", state: "ok", query: DEFAULT_FILTER, count: 1 },
    ]);
    expect(list.items).toEqual([expect.objectContaining({ id: "todoist:a", context: "Widgets" })]);
    expect(fetchImpl.mock.calls[0]![1]).toEqual({ headers: { authorization: "Bearer tok" } });
  });

  test("uses the saved filter", async () => {
    const { bb, harness, plugin } = host(
      {
        [filterPath("#Widgets & p1")]: { results: [], next_cursor: null },
        [PROJECTS_PATH]: PROJECTS,
      },
      { todoistApiToken: "tok", todoistFilter: "  #Widgets & p1 " },
    );
    await plugin(bb);

    await expect(harness.behavior.callRpc("items_list", null)).resolves.toMatchObject({
      items: [],
      sources: [{ state: "ok", query: "#Widgets & p1", count: 0 }],
    });
  });

  test("follows the cursor through every page", async () => {
    const { bb, harness, plugin } = host({
      [filterPath(DEFAULT_FILTER)]: { results: [rawTask("a")], next_cursor: "abc.def" },
      [filterPath(DEFAULT_FILTER, "abc.def")]: { results: [rawTask("b")], next_cursor: null },
      [PROJECTS_PATH]: PROJECTS,
    });
    await plugin(bb);

    const list = (await harness.behavior.callRpc("items_list", null)) as NextList;
    expect(list.items.map((item) => item.id)).toEqual(["todoist:a", "todoist:b"]);
  });

  test("passes along why Todoist rejected the filter", async () => {
    const { bb, harness, plugin } = host({
      [filterPath(DEFAULT_FILTER)]: { status: 400, body: { error: "Invalid filter query" } },
      [PROJECTS_PATH]: PROJECTS,
    });
    await plugin(bb);

    await expect(harness.behavior.callRpc("items_list", null)).resolves.toMatchObject({
      sources: [
        {
          id: "todoist",
          state: "error",
          query: DEFAULT_FILTER,
          message: "Returned 400: Invalid filter query",
        },
      ],
    });
  });

  test("says the token is the problem on a 401", async () => {
    const { bb, harness, plugin } = host({
      [filterPath(DEFAULT_FILTER)]: { status: 401, body: "Unauthorized" },
      [PROJECTS_PATH]: { status: 401, body: "Unauthorized" },
    });
    await plugin(bb);

    const list = (await harness.behavior.callRpc("items_list", null)) as NextList;
    const [source] = list.sources;
    expect(source?.state === "error" && source.message).toContain("todoistApiToken");
  });
});

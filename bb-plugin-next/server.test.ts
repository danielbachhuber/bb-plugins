import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, test, vi } from "vitest";

import { GwsMissingError, type GwsRunner } from "./gmail/gws.js";
import type { Listing, NextList } from "./next/contract.js";
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

type Settings = Record<string, string | number | boolean>;

/** Todoist only, so these tests never reach for gws. */
const TODOIST_ONLY: Settings = { todoistApiToken: "tok", gmailEnabled: false };

/** A gws that answers by subcommand: `threads list`, `threads get`, `getProfile`. */
function fakeGws(answers: Record<string, (params: Record<string, unknown>) => unknown>) {
  const calls: string[][] = [];
  const run: GwsRunner = async (args) => {
    calls.push(args);
    const key = args.slice(0, args.indexOf("--params")).filter((part) => part !== "gmail" && part !== "users").join(" ");
    const answer = answers[key];
    if (answer === undefined) throw new Error(`unexpected gws ${args.join(" ")}`);
    return JSON.stringify(answer(JSON.parse(args[args.indexOf("--params") + 1]!)));
  };
  return { run, calls };
}

function host(routes: Record<string, Route>, settings: Settings = TODOIST_ONLY, gws: GwsRunner = fakeGws({}).run) {
  const fetchImpl = routedFetch(routes);
  const created = createFakePluginHost({ pluginId: "next", settings });
  const gwsPaths: string[] = [];
  const plugin = createPlugin({
    fetch: fetchImpl as unknown as typeof fetch,
    gws: (path) => {
      gwsPaths.push(path);
      return gws;
    },
    now: () => new Date("2026-09-24T09:30:00Z"),
  });
  return { ...created, plugin, fetchImpl, gwsPaths };
}

type Harness = ReturnType<typeof host>["harness"];

/** Sync, then read the stored list, the way the page does. */
async function syncAndRead(harness: Harness): Promise<NextList> {
  await harness.behavior.callRpc("items_sync", null);
  const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
  if (listing.list === null) throw new Error("nothing stored after a sync");
  return listing.list;
}

describe("configuration", () => {
  test("reports needing configuration with no source switched on, and calls nothing", async () => {
    const { bb, harness, plugin, fetchImpl } = host({}, { gmailEnabled: false });
    await plugin(bb);

    expect(harness.needsConfigurationMessages.join(" ")).toContain("bb plugin config next set todoistApiToken");
    await expect(syncAndRead(harness)).resolves.toMatchObject({
      items: [],
      sources: [{ id: "todoist", state: "unconfigured" }],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("loads cleanly with only Gmail switched on", async () => {
    const { bb, harness, plugin } = host({}, {});
    await plugin(bb);

    expect(harness.needsConfigurationMessages).toHaveLength(0);
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

    const list = await syncAndRead(harness);

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
      { ...TODOIST_ONLY, todoistFilter: "  #Widgets & p1 " },
    );
    await plugin(bb);

    await expect(syncAndRead(harness)).resolves.toMatchObject({
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

    const list = await syncAndRead(harness);
    expect(list.items.map((item) => item.id)).toEqual(["todoist:a", "todoist:b"]);
  });

  test("passes along why Todoist rejected the filter", async () => {
    const { bb, harness, plugin } = host({
      [filterPath(DEFAULT_FILTER)]: { status: 400, body: { error: "Invalid filter query" } },
      [PROJECTS_PATH]: PROJECTS,
    });
    await plugin(bb);

    await expect(syncAndRead(harness)).resolves.toMatchObject({
      sources: [
        {
          id: "todoist",
          state: "error",
          query: DEFAULT_FILTER,
          message: "Returned 400: Invalid filter query",
          kept: 0,
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

    const list = await syncAndRead(harness);
    const [source] = list.sources;
    expect(source?.state === "error" && source.message).toContain("todoistApiToken");
  });
});

describe("items_list with Gmail", () => {
  function thread(id: string, subject: string, internalDate: string) {
    return {
      id,
      messages: [
        {
          id: `${id}-1`,
          internalDate,
          snippet: "Can we ship the widgets?",
          payload: { headers: [{ name: "Subject", value: subject }, { name: "From", value: "Octocat <octocat@example.com>" }] },
        },
      ],
    };
  }

  test("merges inbox threads with Todoist tasks, and asks for the account once", async () => {
    const gws = fakeGws({
      "threads list": () => ({ threads: [{ id: "t1" }, { id: "t2" }] }),
      "threads get": (params) =>
        params.id === "t1" ? thread("t1", "Widget launch", "1790200000000") : thread("t2", "Gadget invoice", "1790237080000"),
      getProfile: () => ({ emailAddress: "hubber@example.com" }),
    });
    const { bb, harness, plugin, gwsPaths } = host(
      {
        [filterPath(DEFAULT_FILTER)]: { results: [rawTask("a", { due: { date: "2026-09-24" } })], next_cursor: null },
        [PROJECTS_PATH]: PROJECTS,
      },
      { todoistApiToken: "tok", gwsPath: " /opt/bin/gws " },
      gws.run,
    );
    await plugin(bb);

    const list = await syncAndRead(harness);
    await syncAndRead(harness);

    expect(list.items.map((item) => item.id)).toEqual(["todoist:a", "gmail:t2", "gmail:t1"]);
    expect(list.sources).toEqual([
      expect.objectContaining({ id: "todoist", state: "ok" }),
      { id: "gmail", name: "Gmail", state: "ok", query: "in:inbox", count: 2 },
    ]);
    expect(list.items[1]).toMatchObject({
      title: "Gadget invoice",
      context: "Octocat",
      url: "https://mail.google.com/mail/?authuser=hubber%40example.com#all/t2",
    });
    expect(gwsPaths).toEqual(["/opt/bin/gws"]);
    expect(gws.calls.filter((args) => args.includes("getProfile"))).toHaveLength(1);
  });

  test("says how to set gws up when it is not installed", async () => {
    const missing: GwsRunner = async () => {
      throw new GwsMissingError("gws");
    };
    const { bb, harness, plugin } = host({}, { gmailEnabled: true }, missing);
    await plugin(bb);

    const list = await syncAndRead(harness);
    expect(list.sources[1]).toMatchObject({ id: "gmail", state: "unconfigured" });
  });

  test("reports a gws failure as the source's error", async () => {
    const failing: GwsRunner = async () => {
      throw new Error("Token has been expired or revoked.");
    };
    const { bb, harness, plugin } = host({}, {}, failing);
    await plugin(bb);

    const list = await syncAndRead(harness);
    expect(list.sources[1]).toEqual({
      id: "gmail",
      name: "Gmail",
      state: "error",
      query: "in:inbox",
      message: "Token has been expired or revoked.",
      kept: 0,
    });
  });
});

describe("stored list", () => {
  const ROUTES = {
    [filterPath(DEFAULT_FILTER)]: { results: [rawTask("a")], next_cursor: null },
    [PROJECTS_PATH]: PROJECTS,
  };

  test("reads nothing before the first sync, and calls no source to read", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);

    await expect(harness.behavior.callRpc("items_list", null)).resolves.toEqual({ list: null, syncing: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("keeps the synced list across a reload, so the page opens with it", async () => {
    const first = host(ROUTES);
    await first.plugin(first.bb);
    await syncAndRead(first.harness);

    const reloaded = await first.harness.reload(first.plugin);
    const listing = (await reloaded.harness.behavior.callRpc("items_list", null)) as Listing;

    expect(listing.list?.items.map((item) => item.id)).toEqual(["todoist:a"]);
  });

  test("skips a sync asked for only when stale, while the list is fresh", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);
    await syncAndRead(harness);
    const calls = fetchImpl.mock.calls.length;

    await expect(harness.behavior.callRpc("items_sync", { ifOlderThanMs: 60_000 })).resolves.toEqual({
      synced: false,
      error: null,
    });
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  test("shares one sync between callers that overlap", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);

    await Promise.all([harness.behavior.callRpc("items_sync", null), harness.behavior.callRpc("items_sync", null)]);

    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes("/tasks/filter"))).toHaveLength(1);
  });

  test("keeps the emails from the last good sync when Gmail fails", async () => {
    let failing = false;
    const gws: GwsRunner = async (args) => {
      if (failing) throw new Error("Token has been expired or revoked.");
      if (args.includes("list")) return JSON.stringify({ threads: [{ id: "t1" }] });
      if (args.includes("getProfile")) return JSON.stringify({ emailAddress: "hubber@example.com" });
      return JSON.stringify({ id: "t1", messages: [{ internalDate: "1790237080000", payload: { headers: [] } }] });
    };
    const { bb, harness, plugin } = host(ROUTES, { todoistApiToken: "tok" }, gws);
    await plugin(bb);
    await syncAndRead(harness);

    failing = true;
    const list = await syncAndRead(harness);

    expect(list.items.map((item) => item.id)).toEqual(["todoist:a", "gmail:t1"]);
    expect(list.sources[1]).toMatchObject({ state: "error", kept: 1 });
  });

  test("announces a sync's start and finish", async () => {
    const { bb, harness, plugin } = host(ROUTES);
    await plugin(bb);
    await harness.behavior.callRpc("items_sync", null);

    expect(harness.realtimeSignals.filter((signal) => signal.channel === "next-synced").map((signal) => signal.payload)).toEqual([
      { syncing: true },
      { syncing: false },
    ]);
  });

  test("syncs in the background on start, then waits the interval", async () => {
    const waits: number[] = [];
    const fetchImpl = routedFetch(ROUTES);
    const created = createFakePluginHost({ pluginId: "next", settings: { ...TODOIST_ONLY, syncIntervalMinutes: "30" } });
    let service: ReturnType<typeof created.harness.runService> | null = null;
    const plugin = createPlugin({
      fetch: fetchImpl as unknown as typeof fetch,
      gws: () => fakeGws({}).run,
      // One pass: record the wait, then stop the service the way a reload does.
      sleep: async (ms) => {
        waits.push(ms);
        service?.controller.abort();
      },
    });
    await plugin(created.bb);

    service = created.harness.runService("sync");
    await service.done;
    const listing = (await created.harness.behavior.callRpc("items_list", null)) as Listing;

    expect(listing.list?.items).toHaveLength(1);
    expect(waits).toEqual([30 * 60_000]);
  });
});

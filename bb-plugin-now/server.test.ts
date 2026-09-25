import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, test, vi } from "vitest";

import { GwsMissingError, type GwsRunner } from "./gmail/gws.js";
import { GhMissingError, type GhRunner } from "./github/gh.js";
import type { Listing, NowList } from "./now/contract.js";
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
    const method = (_init?.method ?? "GET").toUpperCase();
    const routed = method === "GET" ? key : `${method} ${key}`;
    if (!(routed in routes)) throw new Error(`unexpected ${method} ${key}`);
    if (routed !== key) return jsonResponse(routes[routed]);

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

const noGh: GhRunner = async () => {
  throw new GhMissingError("gh");
};

function host(
  routes: Record<string, Route>,
  settings: Settings = TODOIST_ONLY,
  gws: GwsRunner = fakeGws({}).run,
  gh: GhRunner = noGh,
) {
  const fetchImpl = routedFetch(routes);
  const created = createFakePluginHost({ pluginId: "now", settings });
  const gwsPaths: string[] = [];
  const plugin = createPlugin({
    fetch: fetchImpl as unknown as typeof fetch,
    gws: (path) => {
      gwsPaths.push(path);
      return gws;
    },
    gh: () => gh,
    now: () => new Date("2026-09-24T09:30:00Z"),
  });
  return { ...created, plugin, fetchImpl, gwsPaths };
}

type Harness = ReturnType<typeof host>["harness"];

/** Sync, then read the stored list, the way the page does. */
async function syncAndRead(harness: Harness): Promise<NowList> {
  await harness.behavior.callRpc("items_sync", null);
  const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
  if (listing.list === null) throw new Error("nothing stored after a sync");
  return listing.list;
}

describe("configuration", () => {
  test("reports needing configuration with no source switched on, and calls nothing", async () => {
    const { bb, harness, plugin, fetchImpl } = host({}, { gmailEnabled: false });
    await plugin(bb);

    expect(harness.needsConfigurationMessages.join(" ")).toContain("bb plugin config now set todoistApiToken");
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

  test("reads a Google comment email in full, and only that one", async () => {
    const docsHeaders = [
      { name: "Subject", value: "Widget plan - comment" },
      { name: "From", value: '"Hubber (Google Docs)" <comments-noreply@docs.google.com>' },
    ];
    const html =
      `<h1>Hubber added a comment to the following document</h1>` +
      `<a href="https://docs.google.com/document/d/doc9/edit">Widget plan</a>` +
      `<div class="document-content-snippet"><span class="notranslate">Widgets</span></div>` +
      `<div class="non-tombstone-post"><h3>Hubber</h3><h4>New</h4><div class="notranslate">Looks right</div></div>` +
      `<div class="posts-section-end"></div>`;
    const gws = fakeGws({
      "threads list": () => ({ threads: [{ id: "t1" }, { id: "d1" }] }),
      "threads get": (params) => {
        if (params.id === "t1") return thread("t1", "Widget launch", "1790200000000");
        const payload =
          params.format === "full"
            ? { headers: docsHeaders, parts: [{ mimeType: "text/html", body: { data: Buffer.from(html).toString("base64url") } }] }
            : { headers: docsHeaders };
        return { id: "d1", messages: [{ id: "d1-1", internalDate: "1790237080000", snippet: "Hubber added a comment", payload }] };
      },
      getProfile: () => ({ emailAddress: "hubber@example.com" }),
    });
    const { bb, harness, plugin } = host({}, { gmailEnabled: true }, gws.run);
    await plugin(bb);

    const list = await syncAndRead(harness);
    expect(list.items.find((item) => item.id === "gdocs:doc9")).toMatchObject({
      title: "Widget plan",
      doc: { quotes: [{ author: "Hubber", text: "Looks right" }] },
    });
    const full = gws.calls.filter((args) => args.includes("get") && args.some((part) => part.includes('"format":"full"')));
    expect(full.map((args) => JSON.parse(args[args.indexOf("--params") + 1]!).id)).toEqual(["d1"]);
  });

  test("shows your reply to an invitation, and replies in Calendar", async () => {
    const eid = Buffer.from("evt1 hubber@example.com").toString("base64url");
    const headers = [
      { name: "Subject", value: "Invitation: Widget review @ Fri Sep 25" },
      { name: "From", value: "Octocat <octocat@example.com>" },
      { name: "X-Google-Calendar-Notification", value: "eventCreated" },
    ];
    const html = `<a href="https://calendar.google.com/calendar/event?action=RESPOND&amp;eid=${eid}&amp;rst=1">Yes</a>`;
    let event = {
      id: "evt1",
      status: "confirmed",
      attendees: [
        { email: "octocat@example.com", responseStatus: "accepted", organizer: true },
        { email: "hubber@example.com", responseStatus: "needsAction", self: true },
      ],
    };
    const patches: unknown[] = [];
    const gws = fakeGws({
      "threads list": () => ({ threads: [{ id: "i1" }] }),
      "threads get": (params) => ({
        id: "i1",
        messages: [
          {
            id: "i1-1",
            internalDate: "1790237080000",
            snippet: "You have been invited",
            payload:
              params.format === "full"
                ? { headers, parts: [{ mimeType: "text/html", body: { data: Buffer.from(html).toString("base64url") } }] }
                : { headers },
          },
        ],
      }),
      getProfile: () => ({ emailAddress: "hubber@example.com" }),
      "calendar events get": () => event,
    });
    const run: GwsRunner = async (args) => {
      if (args.slice(0, 3).join(" ") === "calendar events patch") {
        const body = JSON.parse(args[args.indexOf("--json") + 1]!);
        patches.push(body);
        event = { ...event, ...body };
        return JSON.stringify(event);
      }
      return gws.run(args);
    };
    const { bb, harness, plugin } = host({}, { gmailEnabled: true }, run);
    await plugin(bb);

    const list = await syncAndRead(harness);
    expect(list.items[0]?.invite).toEqual({ eventId: "evt1", response: "needsAction", cancelled: false });

    await expect(harness.behavior.callRpc("items_rsvp", { id: "gmail:i1", response: "accepted" })).resolves.toEqual({
      response: "accepted",
      error: null,
    });
    expect(patches).toEqual([
      {
        attendees: [
          { email: "octocat@example.com", responseStatus: "accepted", organizer: true },
          { email: "hubber@example.com", responseStatus: "accepted", self: true },
        ],
      },
    ]);
    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items[0]?.invite?.response).toBe("accepted");
  });

  test("will not reply to an email that is not an invitation", async () => {
    const gws = fakeGws({
      "threads list": () => ({ threads: [{ id: "t1" }] }),
      "threads get": () => thread("t1", "Widget launch", "1790200000000"),
      getProfile: () => ({ emailAddress: "hubber@example.com" }),
    });
    const { bb, harness, plugin } = host({}, { gmailEnabled: true }, gws.run);
    await plugin(bb);
    await syncAndRead(harness);
    await expect(harness.behavior.callRpc("items_rsvp", { id: "gmail:t1", response: "accepted" })).resolves.toMatchObject({
      response: null,
    });
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

    await expect(harness.behavior.callRpc("items_list", null)).resolves.toEqual({
      list: null,
      threads: {},
      threadProjectId: null,
      syncing: false,
    });
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

    expect(harness.realtimeSignals.filter((signal) => signal.channel === "now-synced").map((signal) => signal.payload)).toEqual([
      { syncing: true },
      { syncing: false },
    ]);
  });

  test("syncs in the background on start, then waits the interval", async () => {
    const waits: number[] = [];
    const fetchImpl = routedFetch(ROUTES);
    const created = createFakePluginHost({ pluginId: "now", settings: { ...TODOIST_ONLY, syncIntervalMinutes: "30" } });
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

describe("row actions", () => {
  /** One GitHub notification thread about acme/widgets#128, read, and one plain email, unread. */
  function inbox() {
    const calls: string[][] = [];
    const run: GwsRunner = async (args) => {
      calls.push(args);
      const params = JSON.parse(args[args.indexOf("--params") + 1] ?? "{}") as { id?: string };
      if (args.includes("list")) return JSON.stringify({ threads: [{ id: "gh1" }, { id: "mail1" }] });
      if (args.includes("getProfile")) return JSON.stringify({ emailAddress: "hubber@example.com" });
      if (args.includes("modify")) return JSON.stringify({ id: params.id, messages: [] });
      if (params.id === "gh1") {
        return JSON.stringify({
          id: "gh1",
          messages: [
            {
              internalDate: "1790237080000",
              snippet: "Merged #128 into main.",
              payload: {
                headers: [
                  { name: "Subject", value: "Re: [acme/widgets] Promote widgets into core (PR #128)" },
                  { name: "In-Reply-To", value: "<acme/widgets/pull/128@github.com>" },
                  { name: "X-GitHub-Reason", value: "review_requested" },
                  { name: "X-GitHub-Sender", value: "octocat" },
                  { name: "X-GitHub-PullRequestStatus", value: "merged" },
                ],
              },
            },
          ],
        });
      }
      return JSON.stringify({
        id: "mail1",
        messages: [{ internalDate: "1790200000000", labelIds: ["INBOX", "UNREAD"], snippet: "Hi", payload: { headers: [{ name: "Subject", value: "Lunch?" }] } }],
      });
    };
    return { run, calls };
  }

  async function loaded(gh: GhRunner = noGh) {
    const gws = inbox();
    const created = host({}, { gmailEnabled: true }, gws.run, gh);
    await created.plugin(created.bb);
    const list = await syncAndRead(created.harness);
    return { ...created, gws, list };
  }

  test("gathers GitHub notifications into one row, with the state from the email when gh is missing", async () => {
    const { list } = await loaded();

    expect(list.items.map((item) => item.id)).toEqual(["github:acme/widgets#128", "gmail:mail1"]);
    expect(list.items[0]).toMatchObject({
      title: "Promote widgets into core",
      description: "merged",
      url: "https://github.com/acme/widgets/pull/128",
      gmail: { threadIds: ["gh1"], unread: false },
      github: { repo: "acme/widgets", number: 128, kind: "pull", state: "merged", reason: "review_requested" },
    });
  });

  test("uses gh for the state when it can", async () => {
    const gh: GhRunner = async (args) => {
      expect(args.slice(0, 2)).toEqual(["api", "graphql"]);
      return JSON.stringify({ data: { r0: { issueOrPullRequest: { __typename: "PullRequest", state: "OPEN", isDraft: false, reviewDecision: "APPROVED" } } } });
    };
    const { list } = await loaded(gh);

    expect(list.items[0]?.github).toMatchObject({ state: "open", review: "approved" });
  });

  test("archives every thread of a row, marks it read, and takes the row off the page", async () => {
    const { harness, gws } = await loaded();

    await expect(harness.behavior.callRpc("items_archive", { id: "github:acme/widgets#128" })).resolves.toEqual({
      archived: true,
      error: null,
    });

    const modify = gws.calls.find((args) => args.includes("modify"))!;
    expect(JSON.parse(modify[modify.indexOf("--params") + 1]!)).toEqual({ userId: "me", id: "gh1" });
    expect(JSON.parse(modify[modify.indexOf("--json") + 1]!)).toEqual({ removeLabelIds: ["INBOX", "UNREAD"] });
    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.map((item) => item.id)).toEqual(["gmail:mail1"]);
  });

  test("will not archive a Todoist task", async () => {
    const { bb, harness, plugin } = host({
      [filterPath(DEFAULT_FILTER)]: { results: [rawTask("a")], next_cursor: null },
      [PROJECTS_PATH]: PROJECTS,
    });
    await plugin(bb);
    await syncAndRead(harness);

    await expect(harness.behavior.callRpc("items_archive", { id: "todoist:a" })).resolves.toMatchObject({ archived: false });
  });

  test("comments on the pull request through gh", async () => {
    const posted: string[][] = [];
    const gh: GhRunner = async (args) => {
      if (args[1] === "graphql") return JSON.stringify({ data: {} });
      posted.push(args);
      return "https://github.com/acme/widgets/pull/128#issuecomment-1\n";
    };
    const { harness } = await loaded(gh);

    await expect(
      harness.behavior.callRpc("items_reply", { id: "github:acme/widgets#128", body: "Thanks, octocat!" }),
    ).resolves.toEqual({ url: "https://github.com/acme/widgets/pull/128#issuecomment-1", error: null });
    expect(posted[0]).toEqual([
      "api", "repos/acme/widgets/issues/128/comments", "--method", "POST", "-f", "body=Thanks, octocat!", "--jq", ".html_url",
    ]);
  });

  test("merges the pull request through gh, and reads its state back", async () => {
    const merges: string[][] = [];
    const gh: GhRunner = async (args) => {
      if (args[1] === "graphql") {
        const state = merges.length > 0 ? "MERGED" : "OPEN";
        return JSON.stringify({ data: { r0: { issueOrPullRequest: { __typename: "PullRequest", state, isDraft: false } } } });
      }
      merges.push(args);
      return "";
    };
    const { harness } = await loaded(gh);

    await expect(harness.behavior.callRpc("items_merge", { id: "github:acme/widgets#128", method: "squash" })).resolves.toEqual({
      merged: true,
      error: null,
    });
    expect(merges).toEqual([["pr", "merge", "128", "--repo", "acme/widgets", "--squash"]]);
    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.find((item) => item.id === "github:acme/widgets#128")?.github).toMatchObject({
      state: "merged",
      mergeMethods: [],
    });
  });

  test("will not merge a plain email", async () => {
    const { harness } = await loaded();
    await expect(harness.behavior.callRpc("items_merge", { id: "gmail:mail1", method: "merge" })).resolves.toMatchObject({
      merged: false,
    });
  });

  test("will not reply to a plain email", async () => {
    const { harness } = await loaded();
    await expect(harness.behavior.callRpc("items_reply", { id: "gmail:mail1", body: "Sure" })).resolves.toMatchObject({
      url: null,
    });
  });

  test("marks a row's threads read, leaving the row on the page, and back to unread on undo", async () => {
    const { harness, gws } = await loaded();

    await expect(harness.behavior.callRpc("items_mark_read", { id: "gmail:mail1" })).resolves.toEqual({ marked: true, error: null });
    let listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.find((item) => item.id === "gmail:mail1")?.gmail).toMatchObject({ unread: false, unreadMessages: 0 });

    await expect(harness.behavior.callRpc("items_undo", { id: "gmail:mail1" })).resolves.toEqual({ restored: true, error: null });
    listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.map((item) => item.id)).toEqual(["github:acme/widgets#128", "gmail:mail1"]);
    expect(listing.list?.items[1]?.gmail).toMatchObject({ unread: true });

    const modifies = gws.calls.filter((args) => args.includes("modify")).map((args) => JSON.parse(args[args.indexOf("--json") + 1]!));
    expect(modifies).toEqual([{ removeLabelIds: ["UNREAD"] }, { addLabelIds: ["UNREAD"] }]);
  });

  test("will not mark a Todoist task read", async () => {
    const { harness } = await loaded();
    await expect(harness.behavior.callRpc("items_mark_read", { id: "todoist:none" })).resolves.toMatchObject({ marked: false });
  });

  test("leaves a row that was read when archived read on undo", async () => {
    const { harness, gws } = await loaded();
    await harness.behavior.callRpc("items_archive", { id: "github:acme/widgets#128" });
    await harness.behavior.callRpc("items_undo", { id: "github:acme/widgets#128" });

    const modifies = gws.calls.filter((args) => args.includes("modify")).map((args) => JSON.parse(args[args.indexOf("--json") + 1]!));
    expect(modifies).toEqual([{ removeLabelIds: ["INBOX", "UNREAD"] }, { addLabelIds: ["INBOX"] }]);
  });

  test("puts an archived row back in the inbox, unread as it was, and on the page on undo", async () => {
    const { harness, gws } = await loaded();
    await harness.behavior.callRpc("items_archive", { id: "gmail:mail1" });

    await expect(harness.behavior.callRpc("items_undo", { id: "gmail:mail1" })).resolves.toEqual({ restored: true, error: null });

    const modifies = gws.calls.filter((args) => args.includes("modify")).map((args) => JSON.parse(args[args.indexOf("--json") + 1]!));
    expect(modifies).toEqual([{ removeLabelIds: ["INBOX", "UNREAD"] }, { addLabelIds: ["INBOX", "UNREAD"] }]);
    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.map((item) => item.id)).toEqual(["github:acme/widgets#128", "gmail:mail1"]);
    await expect(harness.behavior.callRpc("items_undo", { id: "gmail:mail1" })).resolves.toMatchObject({ restored: false });
  });
});

describe("completing a task", () => {
  const ROUTES = {
    [filterPath(DEFAULT_FILTER)]: { results: [rawTask("a"), rawTask("b")], next_cursor: null },
    [PROJECTS_PATH]: PROJECTS,
    "POST /api/v1/tasks/a/close": null,
    "POST /api/v1/tasks/a/reopen": null,
  };

  test("closes it in Todoist and takes the row off the page, and undo reopens it", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);
    await syncAndRead(harness);

    await expect(harness.behavior.callRpc("items_complete", { id: "todoist:a" })).resolves.toEqual({
      completed: true,
      undoable: true,
      error: null,
    });
    let listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.map((item) => item.id)).toEqual(["todoist:b"]);

    await harness.behavior.callRpc("items_undo", { id: "todoist:a" });
    listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.map((item) => item.id)).toEqual(["todoist:a", "todoist:b"]);

    const posts = fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => new URL(url).pathname);
    expect(posts).toEqual(["/api/v1/tasks/a/close", "/api/v1/tasks/a/reopen"]);
  });

  /** Hold the next Todoist task read until `release` is called, so a sync can be caught mid-flight. */
  function holdNextRead(fetchImpl: ReturnType<typeof host>["fetchImpl"]) {
    const original = fetchImpl.getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    fetchImpl.mockImplementation(async (url, init) => {
      const response = await original(url, init);
      if (url.includes("/tasks/filter") && reads++ === 0) await held;
      return response;
    });
    return release;
  }

  test("keeps a row completed while a sync was reading off the page", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);
    await syncAndRead(harness);

    const release = holdNextRead(fetchImpl);
    const syncing = harness.behavior.callRpc("items_sync", null);
    await vi.waitFor(() => expect(fetchImpl.mock.calls.filter(([url]) => url.includes("/tasks/filter"))).toHaveLength(2));
    await harness.behavior.callRpc("items_complete", { id: "todoist:a" });
    release();
    await syncing;

    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.map((item) => item.id)).toEqual(["todoist:b"]);
  });

  test("keeps a row undone while a sync was reading on the page", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);
    await syncAndRead(harness);
    await harness.behavior.callRpc("items_complete", { id: "todoist:a" });

    // This sync's read is from before the undo, so it would not have the task.
    const original = fetchImpl.getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    fetchImpl.mockImplementation(async (url, init) => {
      if (!url.includes("/tasks/filter")) return original(url, init);
      await held;
      return jsonResponse({ results: [rawTask("b")], next_cursor: null });
    });
    const syncing = harness.behavior.callRpc("items_sync", null);
    await vi.waitFor(() => expect(fetchImpl.mock.calls.filter(([url]) => url.includes("/tasks/filter"))).toHaveLength(2));
    fetchImpl.mockImplementation(async (url, init) => original(url, init));
    await harness.behavior.callRpc("items_undo", { id: "todoist:a" });
    release();
    await syncing;

    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.map((item) => item.id)).toEqual(["todoist:a", "todoist:b"]);
  });

  test("offers no undo for a recurring task, which moved to its next date", async () => {
    const { bb, harness, plugin } = host({
      ...ROUTES,
      [filterPath(DEFAULT_FILTER)]: {
        results: [rawTask("a", { due: { date: "2026-09-24", is_recurring: true } })],
        next_cursor: null,
      },
    });
    await plugin(bb);
    await syncAndRead(harness);

    await expect(harness.behavior.callRpc("items_complete", { id: "todoist:a" })).resolves.toMatchObject({ undoable: false });
    await expect(harness.behavior.callRpc("items_undo", { id: "todoist:a" })).resolves.toMatchObject({ restored: false });
  });

  test("will not complete an email", async () => {
    const { bb, harness, plugin } = host(ROUTES);
    await plugin(bb);
    await syncAndRead(harness);
    await expect(harness.behavior.callRpc("items_complete", { id: "gmail:x" })).resolves.toMatchObject({ completed: false });
  });
});

describe("editing a task", () => {
  const ROUTES = {
    [filterPath(DEFAULT_FILTER)]: { results: [rawTask("a"), rawTask("b")], next_cursor: null },
    [PROJECTS_PATH]: {
      results: [
        { id: "p1", name: "Widgets" },
        { id: "p2", name: "Gadgets" },
        { id: "p3", name: "Dashboard", parent_id: "p2" },
      ],
      next_cursor: null,
    },
    "POST /api/v1/tasks/a": null,
    "POST /api/v1/tasks/a/move": null,
    "/api/v1/tasks/a": rawTask("a", {
      content: "Order the gadget samples",
      project_id: "p2",
      priority: 3,
      due: { date: "2026-10-02", string: "next fri", is_recurring: false },
    }),
    "DELETE /api/v1/tasks/b": null,
  };

  test("lists the projects nested as Todoist has them", async () => {
    const { bb, harness, plugin } = host(ROUTES);
    await plugin(bb);
    await expect(harness.behavior.callRpc("todoist_projects", null)).resolves.toEqual({
      projects: [
        { id: "p1", name: "Widgets", depth: 0, inbox: false },
        { id: "p2", name: "Gadgets", depth: 0, inbox: false },
        { id: "p3", name: "Dashboard", depth: 1, inbox: false },
      ],
      error: null,
    });
  });

  test("sends the name, date, priority, and move together, and the row takes what Todoist saved", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);
    await syncAndRead(harness);
    // Hold the sync the save starts, to read the row as the save left it.
    const original = fetchImpl.getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    fetchImpl.mockImplementation(async (url, init) => {
      if (url.includes("/tasks/filter")) await held;
      return original(url, init);
    });

    await expect(
      harness.behavior.callRpc("items_edit", {
        id: "todoist:a",
        content: "Order the gadget samples",
        due: "next fri",
        deadline: "2026-10-09",
        priority: 2,
        projectId: "p2",
      }),
    ).resolves.toEqual({ saved: true, error: null });

    const writes = fetchImpl.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([url, init]) => [new URL(url).pathname, JSON.parse(String(init?.body))]);
    expect(writes).toEqual([
      ["/api/v1/tasks/a", { content: "Order the gadget samples", due_string: "next fri", deadline_date: "2026-10-09", priority: 3 }],
      ["/api/v1/tasks/a/move", { project_id: "p2" }],
    ]);
    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items[0]).toMatchObject({
      id: "todoist:a",
      title: "Order the gadget samples",
      context: "Gadgets",
      priority: 2,
      due: { date: "2026-10-02", text: "next fri" },
    });
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes("/tasks/filter"))).toHaveLength(2);
    release();
  });

  test("calls Todoist for nothing when the draft changes nothing", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);
    await syncAndRead(harness);
    await expect(
      harness.behavior.callRpc("items_edit", { id: "todoist:a", content: "Task a", due: "", priority: 4, projectId: "p1" }),
    ).resolves.toEqual({ saved: true, error: null });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);
  });

  test("deletes a task and takes its row off the page", async () => {
    const { bb, harness, plugin, fetchImpl } = host(ROUTES);
    await plugin(bb);
    await syncAndRead(harness);
    await expect(harness.behavior.callRpc("items_delete", { id: "todoist:b" })).resolves.toEqual({ deleted: true, error: null });
    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.list?.items.map((item) => item.id)).toEqual(["todoist:a"]);
    expect(fetchImpl.mock.calls.some(([url, init]) => init?.method === "DELETE" && url.endsWith("/tasks/b"))).toBe(true);
  });
});

describe("starting a thread", () => {
  const ROUTES = {
    [filterPath(DEFAULT_FILTER)]: { results: [rawTask("a")], next_cursor: null },
    [PROJECTS_PATH]: PROJECTS,
  };
  const REQUEST = { projectId: "proj_1", input: [{ type: "text", text: "Order widget samples", mentions: [] }] };

  function threadHost() {
    let spawned = 0;
    const created = createFakePluginHost({
      pluginId: "now",
      settings: TODOIST_ONLY,
      sdk: {
        threads: {
          spawn: async () => {
            spawned += 1;
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { id: `thr_${spawned}` } as never;
          },
        },
      } as never,
    });
    const plugin = createPlugin({
      fetch: routedFetch(ROUTES) as unknown as typeof fetch,
      gws: () => fakeGws({}).run,
      gh: () => noGh,
    });
    return { ...created, plugin };
  }

  test("spawns what the composer resolved, titled for the row, and links it", async () => {
    const { bb, harness, plugin } = threadHost();
    await plugin(bb);
    await syncAndRead(harness);

    await expect(harness.behavior.callRpc("items_start_thread", { id: "todoist:a", request: REQUEST })).resolves.toEqual({
      threadId: "thr_1",
      existing: false,
      error: null,
    });

    const [[args]] = harness.inspection.sdk.callsTo("threads.spawn") as [[Record<string, unknown>]];
    expect(args).toMatchObject({ ...REQUEST, title: "Task a" });
    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.threads).toEqual({ "todoist:a": "thr_1" });
  });

  test("starts one thread when two submits race, and returns it after", async () => {
    const { bb, harness, plugin } = threadHost();
    await plugin(bb);
    await syncAndRead(harness);

    const [first, second] = await Promise.all([
      harness.behavior.callRpc("items_start_thread", { id: "todoist:a", request: REQUEST }),
      harness.behavior.callRpc("items_start_thread", { id: "todoist:a", request: REQUEST }),
    ]);
    expect(first).toEqual(second);
    expect(harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
    await expect(harness.behavior.callRpc("items_start_thread", { id: "todoist:a", request: REQUEST })).resolves.toMatchObject({
      threadId: "thr_1",
      existing: true,
    });
  });

  test("forgets the link once the thread is archived", async () => {
    const { bb, harness, plugin } = threadHost();
    await plugin(bb);
    await syncAndRead(harness);
    await harness.behavior.callRpc("items_start_thread", { id: "todoist:a", request: REQUEST });

    await harness.behavior.emitThreadEvent("thread.archived", { thread: { id: "thr_1" } } as never);

    const listing = (await harness.behavior.callRpc("items_list", null)) as Listing;
    expect(listing.threads).toEqual({});
  });
});


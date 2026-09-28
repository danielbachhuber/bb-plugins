import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin, { createShelf, type ShelfDeps } from "./server";
import { normalizeRepoUrl } from "./shelf/classify";
import { runGit } from "./shelf/git";
import { makeTestRepo } from "./shelf/test-repo";

let clone: string;
let origin: string;

beforeAll(() => {
  ({ clone, origin } = makeTestRepo());
});

function deps(overrides: Partial<ShelfDeps> = {}): ShelfDeps {
  return {
    git: runGit,
    now: () => 1_000_000,
    selfId: "plugin-shelf",
    listInstalled: async () => [
      { id: "plugin-shelf", rootDir: join(clone, "bb-plugin-widgets"), enabled: true },
      { id: "widgets", rootDir: join(clone, "bb-plugin-widgets"), enabled: true },
    ],
    searchCatalog: async (query) =>
      [
        { entryId: "widgets", pluginId: "widgets", marketplace: "bb-community" },
        // A search for a short id matches unrelated entries too.
        { entryId: "widgets-extra", pluginId: "widgets-extra", marketplace: "bb-community" },
        { entryId: "widgets", pluginId: "widgets", marketplace: "someone-else" },
      ].filter((e) => e.pluginId.includes(query)),
    installPlan: async () => ({
      kind: "git",
      url: origin,
      subdir: "bb-plugin-widgets",
      range: "^0.1.0",
      tagPrefix: "widgets/",
    }),
    ...overrides,
  };
}

function failingRemote(): ShelfDeps["git"] {
  return (cwd, args) =>
    args[0] === "fetch" || args[0] === "ls-remote"
      ? Promise.reject(new Error("could not resolve host"))
      : runGit(cwd, args);
}

describe("shelf_list", () => {
  it("classifies the checkout the shelf was installed from", async () => {
    const result = await createShelf(deps()).list(true);
    const widgets = result.rows.find((r) => r.id === "widgets")!;
    expect(widgets.group).toBe("needs-release");
    expect(widgets.latestTag).toBe("widgets/v0.1.0");
    expect(widgets.commits.map((c) => c.subject)).toEqual(["Describe widgets", "Draw widgets"]);
    expect(result.rows.find((r) => r.id === "gadgets")!.group).toBe("personal");
    expect(result.checkout?.repo).toBe(normalizeRepoUrl(origin));
  });

  it("counts only an exact id match in bb-community", async () => {
    const installPlan = vi.fn(deps().installPlan);
    await createShelf(deps({ installPlan })).list(true);
    expect(installPlan.mock.calls.map(([id]) => id)).toEqual(["widgets"]);
  });

  it("shows unknown rather than personal when the catalog fails", async () => {
    const result = await createShelf(
      deps({ searchCatalog: async () => { throw new Error("offline"); } }),
    ).list(true);
    expect(result.rows.every((r) => r.group === "unknown")).toBe(true);
    expect(result.marketplaceError).toContain("offline");
  });

  it("keeps the last good rows when a later fetch fails", async () => {
    let failing = false;
    let clock = 1_000_000;
    const bad = failingRemote();
    const git: ShelfDeps["git"] = (cwd, args) => (failing ? bad(cwd, args) : runGit(cwd, args));
    const shelf = createShelf(deps({ git, now: () => clock }));
    const first = await shelf.list(true);
    failing = true;
    clock += 120_000;
    const second = await shelf.list(true);
    expect(second.rows).toEqual(first.rows);
    expect(second.fetchError).toContain("could not resolve host");
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it("shows unknown on a first refresh that cannot reach origin", async () => {
    const result = await createShelf(deps({ git: failingRemote() })).list(true);
    expect(result.rows.every((r) => r.group === "unknown")).toBe(true);
    expect(result.fetchError).toContain("could not resolve host");
  });

  it("fetches at most once a minute", async () => {
    const git = vi.fn(runGit);
    const shelf = createShelf(deps({ git }));
    await shelf.list(true);
    await shelf.list(true);
    expect(git.mock.calls.filter(([, args]) => args[0] === "fetch")).toHaveLength(1);
  });

  it("explains a shelf installed outside a plugin checkout", async () => {
    const result = await createShelf(
      deps({ listInstalled: async () => [{ id: "plugin-shelf", rootDir: "/", enabled: true }] }),
    ).list(true);
    expect(result.checkout).toBeNull();
    expect(result.emptyReason).toMatch(/git checkout|plugins\.json/);
  });
});

describe("shelf_publish", () => {
  function host(spawn = vi.fn(async () => makeThreadResponse({ id: "thr_publish" }))) {
    const { bb, harness } = createFakePluginHost({
      pluginId: "plugin-shelf",
      sdk: {
        plugins: {
          list: async () => ({
            plugins: [{ id: "plugin-shelf", rootDir: join(clone, "bb-plugin-widgets"), enabled: true }],
          }),
          catalog: {
            search: async ({ query }: { query: string }) => ({
              results: query === "widgets"
                ? [{ entryId: "widgets", pluginId: "widgets", marketplace: "bb-community" }]
                : [],
            }),
            installPlan: async () => ({
              resolvedSource: {
                kind: "git", url: origin, subdir: "bb-plugin-widgets", range: "^0.1.0", tagPrefix: "widgets/",
              },
            }),
          },
        },
        projects: {
          list: async () => [
            {
              id: "proj_widgets",
              sources: [{ type: "local_path", hostId: "host_a", path: clone }],
            },
          ],
        },
        threads: { spawn },
      } as never,
    });
    return { bb, harness, spawn };
  }

  it("starts a thread in the checkout that runs the publish skill", async () => {
    const { bb, harness, spawn } = host();
    await plugin(bb);
    const result = await harness.behavior.callRpc("shelf_publish", { pluginId: "widgets" });
    expect(result).toEqual({ threadId: "thr_publish" });
    expect(spawn.mock.calls[0]?.[0]).toMatchObject({
      projectId: "proj_widgets",
      providerId: "claude-code",
      environment: { type: "host", hostId: "host_a", workspace: { type: "unmanaged", path: clone } },
      title: "Publish Widgets",
      input: [{ type: "text", text: expect.stringContaining("publish-plugin-update skill") }],
    });
  });

  it("refuses a plugin that is not published", async () => {
    const { bb, harness, spawn } = host();
    await plugin(bb);
    await expect(
      harness.behavior.callRpc("shelf_publish", { pluginId: "gadgets" }),
    ).rejects.toThrow("gadgets is not published");
    expect(spawn).not.toHaveBeenCalled();
  });
});

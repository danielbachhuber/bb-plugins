import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
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
        { entryId: "widgets", pluginId: "widgets", marketplace: "bb-community", installs: 12 },
        // A search for a short id matches unrelated entries too.
        {
          entryId: "widgets-extra",
          pluginId: "widgets-extra",
          marketplace: "bb-community",
          installs: 3,
        },
        { entryId: "widgets", pluginId: "widgets", marketplace: "someone-else", installs: 40 },
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
    expect(widgets.installs).toBe(12);
    expect(widgets.commits.map((c) => c.subject)).toEqual(["Describe widgets", "Draw widgets"]);
    expect(result.rows.find((r) => r.id === "gadgets")!.group).toBe("personal");
    expect(result.rows.find((r) => r.id === "gadgets")!.installs).toBeNull();
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

  it("reads a release tag pushed from another clone without a refresh", async () => {
    const own = makeTestRepo();
    const other = join(mkdtempSync(join(tmpdir(), "shelf-other-")), "other");
    execFileSync("git", ["clone", "--quiet", own.origin, other]);
    execFileSync("git", ["tag", "-a", "-m", "Release", "widgets/v0.1.2", "origin/main"], {
      cwd: other,
      env: { ...process.env, GIT_COMMITTER_NAME: "Octocat", GIT_COMMITTER_EMAIL: "octocat@example.com" },
    });
    execFileSync("git", ["push", "--quiet", "origin", "widgets/v0.1.2"], { cwd: other });
    const result = await createShelf(
      deps({
        listInstalled: async () => [
          { id: "plugin-shelf", rootDir: join(own.clone, "bb-plugin-widgets"), enabled: true },
        ],
        installPlan: async () => ({
          kind: "git", url: own.origin, subdir: "bb-plugin-widgets", range: "^0.1.0", tagPrefix: "widgets/",
        }),
      }),
    ).list(false);
    const widgets = result.rows.find((r) => r.id === "widgets")!;
    expect(result.fetchError).toBeNull();
    expect(widgets.latestTag).toBe("widgets/v0.1.2");
    expect(widgets.commits).toEqual([]);
  });

  it("keeps the last good rows when a later marketplace read fails", async () => {
    let catalogDown = false;
    let gitDown = false;
    let clock = 1_000_000;
    const good = deps();
    const bad = failingRemote();
    const shelf = createShelf(
      deps({
        now: () => clock,
        git: (cwd, args) => (gitDown ? bad(cwd, args) : runGit(cwd, args)),
        searchCatalog: async (query) => {
          if (catalogDown) throw new Error("catalog down");
          return good.searchCatalog(query);
        },
      }),
    );
    await shelf.list(true);
    catalogDown = true;
    expect((await shelf.list(true)).marketplaceError).toContain("catalog down");
    catalogDown = false;
    gitDown = true;
    clock += 120_000;
    const offline = await shelf.list(true);
    expect(offline.fetchError).toContain("could not resolve host");
    expect(offline.rows.find((r) => r.id === "widgets")!.group).toBe("needs-release");
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

describe("shelf_publish", () => {
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

/** A NewThreadRequest as BB's composer submits one. */
function composerRequest(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "proj_widgets",
    providerId: "codex",
    model: "gpt-6",
    permissionMode: "auto",
    environment: { type: "host", workspace: { type: "managed-worktree" } },
    input: [{ type: "text", text: "Add a snap-to-grid toggle.\nKeep it off by default.", mentions: [] }],
    ...overrides,
  };
}

describe("shelf_project", () => {
  it("names the bb project whose folder is the checkout", async () => {
    const { bb, harness } = host();
    await plugin(bb);
    expect(await harness.behavior.callRpc("shelf_project", {})).toEqual({ projectId: "proj_widgets" });
  });
});

describe("shelf_thread_create", () => {
  it("says which plugin the thread is for, and forwards the rest untouched", async () => {
    const spawn = vi.fn(async () => makeThreadResponse({ id: "thr_work" }));
    const { bb, harness } = host(spawn);
    await plugin(bb);
    const result = await harness.behavior.callRpc("shelf_thread_create", {
      pluginId: "widgets",
      request: composerRequest(),
    });
    expect(result).toEqual({ threadId: "thr_work" });
    const args = spawn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args).toMatchObject({
      projectId: "proj_widgets",
      providerId: "codex",
      model: "gpt-6",
      permissionMode: "auto",
      environment: { type: "host", workspace: { type: "managed-worktree" } },
      title: "Widgets: Add a snap-to-grid toggle.",
    });
    expect(args.input).toEqual([
      {
        type: "text",
        // bb joins prompt items with nothing between them, so the context
        // ends with a blank line to keep it apart from what was typed.
        text: expect.stringMatching(/the Widgets plugin, in `bb-plugin-widgets\/`.*\n\n$/s),
        mentions: [],
      },
      { type: "text", text: "Add a snap-to-grid toggle.\nKeep it off by default.", mentions: [] },
    ]);
  });

  it("titles a thread with no typed text after the plugin alone", async () => {
    const spawn = vi.fn(async () => makeThreadResponse({ id: "thr_work" }));
    const { bb, harness } = host(spawn);
    await plugin(bb);
    await harness.behavior.callRpc("shelf_thread_create", {
      pluginId: "gadgets",
      request: composerRequest({ input: [{ type: "text", text: "  ", mentions: [] }] }),
    });
    expect((spawn.mock.calls[0]?.[0] as { title: string }).title).toBe("gadgets");
  });

  it("refuses a plugin that is not in the checkout", async () => {
    const spawn = vi.fn(async () => makeThreadResponse({ id: "thr_work" }));
    const { bb, harness } = host(spawn);
    await plugin(bb);
    await expect(
      harness.behavior.callRpc("shelf_thread_create", { pluginId: "sprockets", request: composerRequest() }),
    ).rejects.toThrow("sprockets is not in this checkout");
    expect(spawn).not.toHaveBeenCalled();
  });
});

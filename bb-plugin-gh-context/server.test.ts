import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin, { REALTIME_CHANNEL } from "./server.js";

const ISSUE = "https://github.com/acme/widgets/issues/12";

interface Setup {
  prompt?: string | null;
  environment?: boolean;
  archived?: boolean;
  pullRequest?: boolean;
}

/**
 * A fake host with one thread. `gh` points nowhere, so every GitHub answer is
 * null: the banner has to be whole without it.
 */
async function setup({ prompt = `Work on ${ISSUE}`, environment = true, archived = false, pullRequest = false }: Setup = {}) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "gh-context",
    settings: { ghPath: "/nonexistent/gh-does-not-exist" },
    sdk: {
      threads: {
        get: async () =>
          makeThreadResponse({
            id: "thr_one",
            environmentId: environment ? "env_one" : null,
            archivedAt: archived ? 1_700_000_000_000 : null,
          }),
        events: {
          list: async () =>
            prompt === null
              ? []
              : [{ data: { input: [{ type: "text", text: prompt }] } }],
        },
        list: async () => [],
        archive: async () => makeThreadResponse({ id: "thr_one" }),
        unarchive: async () => makeThreadResponse({ id: "thr_one" }),
      },
      environments: {
        get: async () => ({ id: "env_one", path: null, defaultBranch: "main", mergeBaseBranch: null }),
        pullRequest: async () =>
          pullRequest
            ? {
                outcome: "available",
                pullRequest: {
                  number: 128,
                  title: "Promote widgets into core",
                  url: "https://github.com/acme/widgets/pull/128",
                  state: "open",
                  baseRefName: "main",
                  headRefName: "bb/promote-widgets",
                  updatedAt: "2026-09-23T11:24:23Z",
                  attention: "checks_pending",
                  checks: { state: "pending", totalCount: 13, passedCount: 10, failedCount: 0, pendingCount: 3 },
                  review: { state: "approved", reviewRequestCount: 0 },
                  mergeability: { state: "mergeable", mergeStateStatus: "UNSTABLE", mergeable: "MERGEABLE" },
                },
              }
            : { outcome: "absent" },
        status: async () => ({
          outcome: "available",
          workspace: {
            workingTree: { state: "clean", hasUncommittedChanges: false, files: [], insertions: 0, deletions: 0, lineStatsComplete: true },
            branch: { currentBranch: "bb/promote-widgets", defaultBranch: "main" },
            checkout: { kind: "branch", branchName: "bb/promote-widgets", headSha: null },
            mergeBase: {
              mergeBaseBranch: "main",
              baseRef: "abc123",
              aheadCount: 2,
              behindCount: 0,
              hasCommittedUnmergedChanges: true,
              commits: [],
              files: Array.from({ length: 36 }, (_, index) => ({ path: `f${index}`, status: "M", insertions: 1, deletions: 1 })),
              insertions: 447,
              deletions: 112,
              lineStatsComplete: true,
            },
          },
        }),
        mergePullRequest: async () => ({}),
        markPullRequestReady: async () => ({}),
      },
      plugins: {
        // No Harvest plugin installed.
        callRpc: async () => {
          throw new Error("plugin not found");
        },
      },
    } as never,
  });
  await plugin(bb);
  return { bb, harness };
}

describe("threadContext", () => {
  it("links the issue the first prompt names, and reads the prompt only once", async () => {
    const { harness } = await setup();
    const first = await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    expect(first.issues).toEqual([
      {
        repo: "acme/widgets",
        number: 12,
        url: ISSUE,
        title: null,
        state: null,
        source: "prompt",
        viaPullRequest: null,
        assignedToMe: false,
      },
    ]);
    await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    expect(harness.inspection.sdk.callsTo("threads.events.list")).toHaveLength(1);
  });

  it("links the pull request a prompt names, for the sweeps to adopt", async () => {
    const { harness } = await setup({ prompt: "Review https://github.com/acme/widgets/pull/128", environment: false });
    await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    expect(await harness.behavior.callRpc("itemsForThread", { threadId: "thr_one" })).toEqual([
      { repo: "acme/widgets", kind: "pull", number: 128, source: "prompt" },
    ]);
  });

  it("does not mark a thread scanned before its first prompt exists", async () => {
    const { harness } = await setup({ prompt: null });
    await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    expect(harness.inspection.sdk.callsTo("threads.events.list")).toHaveLength(2);
  });

  it("shows the environment's pull request and its committed changes", async () => {
    const { harness } = await setup({ pullRequest: true });
    const context = await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    expect(context.pullRequest).toMatchObject({
      repo: "acme/widgets",
      number: 128,
      attention: "checks_pending",
      canMerge: true,
      myReview: null,
      reviewers: null,
    });
    expect(context.changes).toEqual({ label: "Committed", files: 36, insertions: 447, deletions: 112 });
    // The merge base comes from the pull request's base branch.
    expect(harness.inspection.sdk.callsTo("environments.status")[0]![0]).toMatchObject({
      environmentId: "env_one",
      mergeBaseBranch: "main",
    });
  });

  it("returns early for an archived thread", async () => {
    const { harness } = await setup({ archived: true, pullRequest: true });
    const context = await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    expect(context).toMatchObject({ archived: true, pullRequest: null, issues: [], changes: null });
    expect(harness.inspection.sdk.callsTo("environments.pullRequest")).toHaveLength(0);
  });

  it("has no pull request or changes for a thread with no environment", async () => {
    const { harness } = await setup({ environment: false });
    const context = await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    expect(context.pullRequest).toBeNull();
    expect(context.changes).toBeNull();
    expect(context.issues).toHaveLength(1);
  });

  it("reports Harvest unavailable when the plugin is not installed", async () => {
    const { harness } = await setup();
    const context = await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    expect(context.harvest).toEqual({ available: false, running: null });
  });

  it("follows the hide setting", async () => {
    const { harness } = await setup();
    expect((await harness.behavior.callRpc("threadContext", { threadId: "thr_one" })).hide).toBe(true);
  });
});

describe("links", () => {
  it("round-trips a sweep's link and tells banners to look again", async () => {
    const { harness } = await setup({ prompt: null });
    await harness.behavior.callRpc("linkThread", {
      threadId: "thr_two",
      repo: "Acme/Widgets",
      kind: "pull",
      number: 128,
      source: "spawned:pr-sweep",
    });
    expect(
      await harness.behavior.callRpc("threadsForItems", {
        items: [{ repo: "acme/widgets", kind: "pull", number: 128 }],
      }),
    ).toEqual([
      {
        repo: "acme/widgets",
        kind: "pull",
        number: 128,
        threads: [{ threadId: "thr_two", source: "spawned:pr-sweep" }],
      },
    ]);
    expect(harness.inspection.realtimeSignals).toContainEqual(
      expect.objectContaining({ channel: REALTIME_CHANNEL, payload: { threadId: "thr_two" } }),
    );

    await harness.behavior.callRpc("unlinkThread", { threadId: "thr_two", source: "spawned:pr-sweep" });
    expect(await harness.behavior.callRpc("itemsForThread", { threadId: "thr_two" })).toEqual([]);
  });

  it("forgets a deleted thread's links", async () => {
    const { harness } = await setup();
    await harness.behavior.callRpc("threadContext", { threadId: "thr_one" });
    await harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "thr_one" }),
    });
    expect(await harness.behavior.callRpc("itemsForThread", { threadId: "thr_one" })).toEqual([]);
  });
});

describe("actions", () => {
  it("merges through bb with the chosen method", async () => {
    const { harness } = await setup({ pullRequest: true });
    await harness.behavior.callRpc("mergePullRequest", { threadId: "thr_one", method: "squash" });
    expect(harness.inspection.sdk.callsTo("environments.mergePullRequest")[0]![0]).toEqual({
      environmentId: "env_one",
      method: "squash",
    });
  });

  it("archives through bb", async () => {
    const { harness } = await setup({ pullRequest: true });
    await harness.behavior.callRpc("archiveThread", { threadId: "thr_one" });
    expect(harness.inspection.sdk.callsTo("threads.archive")[0]![0]).toEqual({ threadId: "thr_one" });
  });

  it("unarchives through bb", async () => {
    const { harness } = await setup({ archived: true });
    await harness.behavior.callRpc("unarchiveThread", { threadId: "thr_one" });
    expect(harness.inspection.sdk.callsTo("threads.unarchive")[0]![0]).toEqual({ threadId: "thr_one" });
  });
});

describe("background scan", () => {
  it("reads each listed thread with its environment, so rule 2 can find a repository", async () => {
    const { harness } = await setup({ prompt: "Take on one part of issue #78" });
    harness.sdk.stub("threads.list", async () => [
      makeThreadResponse({ id: "thr_one", environmentId: "env_one" }),
    ]);
    const service = harness.behavior.runService("scan");
    await new Promise((resolve) => setTimeout(resolve, 50));
    service.controller.abort();
    await service.done;
    expect(harness.inspection.sdk.callsTo("environments.get")[0]![0]).toMatchObject({
      environmentId: "env_one",
    });
  });
});

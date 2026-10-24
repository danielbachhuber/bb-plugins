import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  GITHUB_PR_STATUS_PLUGIN_ID,
  environmentPullRequest,
  markPullRequestReady,
  mergePullRequest,
} from "./pr-status.js";

const PULL_REQUEST = {
  number: 128,
  title: "Promote widgets into core",
  url: "https://github.com/acme/widgets/pull/128",
  state: "open",
  baseRefName: "main",
  headRefName: "bb/promote-widgets",
  updatedAt: "2026-09-23T11:24:23Z",
  autoMerge: false,
  inMergeQueue: false,
  attention: "checks_pending",
  checks: { state: "pending", totalCount: 13, passedCount: 10, failedCount: 0, pendingCount: 3 },
  review: { state: "approved", reviewRequestCount: 0 },
  mergeability: { state: "mergeable", mergeStateStatus: "UNSTABLE", mergeable: "MERGEABLE" },
};

/** A `bb.sdk` whose callRpc answers with `answer` and parses it as bb's SDK does. */
function fakeSdk(answer: unknown) {
  const calls: { pluginId: string; method: string; input: unknown }[] = [];
  return {
    calls,
    plugins: {
      async callRpc(args: { pluginId: string; method: string; input: unknown; outputSchema: z.ZodType<unknown> }) {
        calls.push({ pluginId: args.pluginId, method: args.method, input: args.input });
        return args.outputSchema.parse(answer);
      },
    },
  };
}

describe("environmentPullRequest", () => {
  it("reads the environment's row from GitHub PR Status", async () => {
    const sdk = fakeSdk({ env_one: { outcome: "available", pullRequest: PULL_REQUEST } });
    const result = await environmentPullRequest(sdk, "env_one");
    expect(sdk.calls).toEqual([
      { pluginId: GITHUB_PR_STATUS_PLUGIN_ID, method: "pullRequests", input: { keys: ["env_one"] } },
    ]);
    expect(result).toMatchObject({ outcome: "available", pullRequest: { number: 128, baseRefName: "main" } });
  });

  it("treats a missing row as absent", async () => {
    expect(await environmentPullRequest(fakeSdk({}), "env_one")).toEqual({ outcome: "absent" });
  });

  it("passes unavailable through", async () => {
    const sdk = fakeSdk({ env_one: { outcome: "unavailable", message: "host offline" } });
    expect(await environmentPullRequest(sdk, "env_one")).toEqual({ outcome: "unavailable", message: "host offline" });
  });
});

describe("actions", () => {
  it("merges with the chosen method", async () => {
    const sdk = fakeSdk({ message: "Merged" });
    await mergePullRequest(sdk, "env_one", "squash");
    expect(sdk.calls).toEqual([
      { pluginId: GITHUB_PR_STATUS_PLUGIN_ID, method: "merge", input: { environmentId: "env_one", method: "squash" } },
    ]);
  });

  it("marks ready", async () => {
    const sdk = fakeSdk({ message: "Ready" });
    await markPullRequestReady(sdk, "env_one");
    expect(sdk.calls).toEqual([
      { pluginId: GITHUB_PR_STATUS_PLUGIN_ID, method: "markReady", input: { environmentId: "env_one" } },
    ]);
  });
});

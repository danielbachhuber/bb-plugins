import { z } from "zod";

/**
 * bb's bundled GitHub PR Status plugin, which owns a thread's pull request
 * since bb 0.47. A plugin server reads and acts on it through
 * `bb.sdk.plugins.callRpc`; `bb plugin rpc inspect bb--github-pr-status`
 * prints its full contract.
 */
export const GITHUB_PR_STATUS_PLUGIN_ID = "bb--github-pr-status";

/** The fields these plugins read. Loose, so a field bb adds is not an error. */
const pullRequestSchema = z.looseObject({
  number: z.number(),
  title: z.string(),
  state: z.enum(["draft", "open", "merged", "closed"]),
  url: z.string(),
  baseRefName: z.string(),
  attention: z.enum([
    "checks_failed",
    "checks_pending",
    "changes_requested",
    "review_requested",
    "conflicts",
    "blocked",
    "draft",
    "queued",
    "ready_to_merge",
    "merged",
    "closed",
    "none",
  ]),
  checks: z.looseObject({
    state: z.string(),
    totalCount: z.number(),
    passedCount: z.number(),
    failedCount: z.number(),
    pendingCount: z.number(),
  }),
  mergeability: z.looseObject({
    state: z.string(),
    mergeable: z.string().nullable(),
  }),
});

const environmentPullRequestSchema = z.discriminatedUnion("outcome", [
  z.looseObject({ outcome: z.literal("available"), pullRequest: pullRequestSchema }),
  z.looseObject({ outcome: z.literal("absent") }),
  z.looseObject({ outcome: z.literal("unavailable"), message: z.string() }),
]);

export type StatusPullRequest = z.infer<typeof pullRequestSchema>;
export type EnvironmentPullRequest = z.infer<typeof environmentPullRequestSchema>;

const pullRequestsSchema = z.record(z.string(), environmentPullRequestSchema);
const actionSchema = z.looseObject({ message: z.string() });

/**
 * The read an app passes to `experimental_useRpcKeyedQuery`, keyed by
 * environment id. A plain object rather than `defineRpcContract`, so an app
 * can import it without the SDK's root entry.
 */
export const githubPrStatusContract = {
  pullRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: pullRequestsSchema,
  },
} as const;

/**
 * `bb.sdk`, typed only as far as these calls need, so each plugin passes its
 * own SDK version's object and a test can pass a stub.
 */
type Sdk = { plugins: { callRpc: unknown } };

interface PluginsArea {
  callRpc(args: { pluginId: string; method: string; input: unknown; outputSchema: z.ZodType<unknown> }): Promise<unknown>;
}

function call<T>(sdk: Sdk, method: string, input: unknown, outputSchema: z.ZodType<T>) {
  // Called as a method: bb's SDK, and the test harness's fake of it, are proxies.
  const plugins = sdk.plugins as PluginsArea;
  return plugins.callRpc({ pluginId: GITHUB_PR_STATUS_PLUGIN_ID, method, input, outputSchema }) as Promise<T>;
}

/**
 * The pull request for the environment's current branch. `unavailable` when
 * the machine is offline or `gh` failed, which callers treat as no pull
 * request, as bb does.
 */
export async function environmentPullRequest(
  sdk: Sdk,
  environmentId: string,
): Promise<EnvironmentPullRequest> {
  const rows = await call(sdk, "pullRequests", { keys: [environmentId] }, pullRequestsSchema);
  return rows[environmentId] ?? { outcome: "absent" };
}

export async function mergePullRequest(
  sdk: Sdk,
  environmentId: string,
  method: "merge" | "squash" | "rebase",
): Promise<void> {
  await call(sdk, "merge", { environmentId, method }, actionSchema);
}

export async function markPullRequestReady(
  sdk: Sdk,
  environmentId: string,
): Promise<void> {
  await call(sdk, "markReady", { environmentId }, actionSchema);
}

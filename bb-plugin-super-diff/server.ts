// bb-plugin-super-diff — backend.
//
// Three surfaces over review/service.ts: the panel (over RPC), the
// `bb super-diff` CLI the agent groups with, and the skill in
// skills/super-diff/SKILL.md that tells it how. A submit publishes a realtime
// signal so the open panel refetches.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createGhRunner, type GhRunner } from "@danielb/gh-shared/gh";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { changesPanelFiles, changesPanelMark } from "./review/changes-panel";
import { REVIEW_CHANGED, rpcShape, type ReviewResult } from "./review/contract";
import { toplevel } from "./review/git";
import { fetchPullRequestFiles, setFileViewed as setGithubViewed, type PullRequestFiles } from "./review/pull-request";
import { fileContents, getView, hunks, setFileViewed, setRead, submit, testsText, verifyData, type BbFiles, type Checkout, type ViewedSync } from "./review/service";
import { createStore, MIGRATIONS } from "./review/store";

export const rpcContract = defineRpcContract(rpcShape);

/** What the Generate button sends to the thread. The skill does the rest. */
export const GENERATE_PROMPT =
  "Use the super-diff skill to group this branch's changes into concerns for review, then submit the grouping with `bb super-diff submit`.";

/** Leave room under the CLI's 1 MiB output limit for the header lines. */
const MAX_HUNKS_OUTPUT = 900_000;

/** How long a thread's pull request files are kept before GitHub is asked again. */
const GITHUB_TTL_MS = 30_000;

const USAGE = [
  "Usage:",
  "  bb super-diff hunks [--full]          Every file and hunk on this branch, numbered from 0",
  "  bb super-diff tests [--helpers a,b]   Each test on this branch, with its numbered steps to cite",
  "  bb super-diff submit <file | json>    Check a grouping and store it if every hunk is placed once",
  "  bb super-diff verify [--json]         Check the stored grouping against the branch",
  "",
  "Each command acts on the thread it runs in. Pass --thread <id> from outside a thread.",
].join("\n");

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db);

  const settings = bb.settings.define({
    syncGithub: {
      type: "select",
      label: "Sync Viewed with GitHub",
      // On: on a thread with an open pull request, a file's Viewed box is
      // GitHub's own, for files whose diff here matches the pull request's.
      options: ["on", "off"],
      default: "on",
    },
    ghPath: { type: "string", label: "Path to the gh CLI", default: "gh" },
    syncChangesPanel: {
      type: "select",
      label: "Sync Viewed with Diff Viewed",
      // On: on a thread with no open pull request, a file's Viewed box is the
      // one the Diff Viewed plugin puts in bb's changes panel, when it is installed.
      options: ["on", "off"],
      default: "on",
    },
  });

  let runner: { path: string; gh: GhRunner } | null = null;
  function ghFor(ghPath: string): GhRunner {
    if (runner?.path !== ghPath) runner = { path: ghPath, gh: createGhRunner(ghPath) };
    return runner.gh;
  }

  // Failures already logged, so a missing gh is one log line, not one per open.
  const logged = new Set<string>();
  function warnOnce(message: string): void {
    if (logged.has(message)) return;
    logged.add(message);
    bb.log.warn(message);
  }

  const githubCache = new Map<string, { value: PullRequestFiles | null; fetchedAt: number }>();
  const inFlight = new Map<string, Promise<PullRequestFiles | null>>();

  async function loadPullRequest(environmentId: string): Promise<PullRequestFiles | null> {
    const { syncGithub, ghPath } = await settings.get();
    if (syncGithub !== "on") return null;
    try {
      const result = await bb.sdk.environments.pullRequest({ environmentId });
      if (result.outcome !== "available" || result.pullRequest.state !== "open") return null;
      return await fetchPullRequestFiles(ghFor(ghPath), result.pullRequest.url);
    } catch (cause) {
      warnOnce(`GitHub sync unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
      return null;
    }
  }

  /** The environment's open pull request and its files, cached, with one request in flight. */
  async function pullRequestFor(environmentId: string): Promise<PullRequestFiles | null> {
    const cached = githubCache.get(environmentId);
    if (cached && Date.now() - cached.fetchedAt < GITHUB_TTL_MS) return cached.value;
    const running = inFlight.get(environmentId);
    if (running) return running;
    const request = loadPullRequest(environmentId)
      .then((value) => {
        githubCache.set(environmentId, { value, fetchedAt: Date.now() });
        return value;
      })
      .finally(() => inFlight.delete(environmentId));
    inFlight.set(environmentId, request);
    return request;
  }

  /**
   * What the service needs to read and write a thread's file Viewed: GitHub's
   * on its open pull request, or with none, the changes panel's through Diff
   * Viewed; null with neither.
   */
  async function viewedSync(threadId: string, environmentId: string): Promise<ViewedSync | null> {
    const pull = await pullRequestFor(environmentId);
    if (pull === null) return changesPanelSync(threadId);
    const files = new Map(pull.files.map((file) => [file.path, file]));
    return {
      where: "github",
      files,
      async setViewed({ path }, viewed) {
        const { ghPath } = await settings.get();
        await setGithubViewed(ghFor(ghPath), pull.id, path, viewed);
        // Keep the cache in step, so the next open does not show the old state for 30 seconds.
        const file = files.get(path);
        if (file) file.viewed = viewed;
      },
    };
  }

  const diffViewedMarks = z.object({ record: z.record(z.string(), z.string()) }).passthrough();

  /** Diff Viewed's marks for the thread, one local RPC; null when it is off, not installed, or does not answer. */
  async function changesPanelSync(threadId: string): Promise<ViewedSync | null> {
    if ((await settings.get()).syncChangesPanel !== "on") return null;
    let record: Record<string, string>;
    try {
      ({ record } = await bb.sdk.plugins.callRpc({ pluginId: "diff-viewed", method: "viewed_list", input: { threadId }, outputSchema: diffViewedMarks }));
    } catch (cause) {
      warnOnce(`Diff Viewed sync unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
      return null;
    }
    return {
      where: "changes-panel",
      files: changesPanelFiles(record),
      async setViewed(file, viewed) {
        const mark = changesPanelMark(file);
        await bb.sdk.plugins.callRpc({ pluginId: "diff-viewed", method: "viewed_set", input: { threadId, ...mark, viewed }, outputSchema: diffViewedMarks });
      },
    };
  }

  /** bb's own changed-file list for an environment, which its changes panel draws. */
  function bbFilesFor(environmentId: string): BbFiles {
    return async (base) => {
      try {
        const result = await bb.sdk.environments.diffFiles({ environmentId, target: "all", mergeBaseBranch: base });
        if (result.outcome === "not_applicable") return { reason: result.message };
        if (result.outcome === "unavailable") return { reason: result.failure.message };
        if (result.truncated) return { reason: "bb's file list was cut short" };
        return result.files.map((file) => file.path);
      } catch (cause) {
        return { reason: `bb's file list failed: ${cause instanceof Error ? cause.message : String(cause)}` };
      }
    };
  }

  /** The thread's checkout on this machine, or why there is none. */
  async function checkoutFor(threadId: string): Promise<(Checkout & { environmentId: string }) | string> {
    const thread = await bb.sdk.threads.get({ threadId });
    if (!thread.environmentId) return "This thread has no environment to review.";
    const env = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    if (!env.isGitRepo || !env.path) return "Super Diff needs a git checkout, and this environment is not one.";
    const root = await toplevel(env.path);
    if (root === null) return "Super Diff needs a local checkout, and this environment's path is not a git work tree on this machine.";
    const base = env.mergeBaseBranch ?? env.baseBranch ?? env.defaultBranch;
    if (!base) return "This environment has no base branch to compare against.";
    return { root, mergeBaseBranch: base, environmentId: thread.environmentId };
  }

  bb.rpc.register(rpcContract, {
    review_get: async ({ threadId }): Promise<ReviewResult> => {
      const checkout = await checkoutFor(threadId);
      if (typeof checkout === "string") return { state: "unavailable", message: checkout };
      return { state: "ok", view: await getView(store, threadId, checkout, bbFilesFor(checkout.environmentId), viewedSync(threadId, checkout.environmentId)) };
    },
    review_set_read: async ({ threadId, path, hunks, read }) => {
      const checkout = await checkoutFor(threadId);
      if (typeof checkout === "string") throw new Error(checkout);
      const error = await setRead(store, threadId, checkout, path, hunks, read, await viewedSync(threadId, checkout.environmentId));
      if (error) bb.log.warn(error);
      return { ok: true as const, error };
    },
    review_file_contents: async ({ threadId, path: file }) => {
      const checkout = await checkoutFor(threadId);
      if (typeof checkout === "string") throw new Error(checkout);
      return { content: await fileContents(checkout, file) };
    },
    review_set_file_viewed: async ({ threadId, path, viewed }) => {
      const checkout = await checkoutFor(threadId);
      if (typeof checkout === "string") throw new Error(checkout);
      const error = await setFileViewed(store, threadId, checkout, path, viewed, await viewedSync(threadId, checkout.environmentId));
      if (error) bb.log.warn(error);
      return { ok: true as const, error };
    },
    review_generate: async ({ threadId }) => {
      await bb.sdk.threads.send({
        threadId,
        input: [{ type: "text", text: GENERATE_PROMPT, mentions: [] }],
        mode: "queue-if-active",
      });
      return { sent: true as const };
    },
  });

  bb.cli.register({
    name: "super-diff",
    summary: "Group this branch's hunks into concerns for the Super Diff panel",
    commands: [
      { name: "hunks", summary: "List every file and hunk on the branch, numbered from 0", usage: "bb super-diff hunks [--full]" },
      { name: "tests", summary: "List each test on the branch with its numbered steps, for scenario citations", usage: "bb super-diff tests [--helpers name,name]" },
      { name: "submit", summary: "Check a grouping and store it if every hunk is placed once", usage: "bb super-diff submit <file | json>" },
      { name: "verify", summary: "Check the stored grouping covers every hunk exactly once", usage: "bb super-diff verify [--json]" },
    ],

    async run(argv, ctx) {
      const flag = (name: string) => argv.includes(name);
      const threadFlag = argv.indexOf("--thread");
      const threadId = threadFlag === -1 ? ctx.threadId : argv[threadFlag + 1];
      const positional = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--thread" && argv[i - 1] !== "--helpers");
      const helpersFlag = argv.indexOf("--helpers");
      const helpers = helpersFlag === -1 ? [] : (argv[helpersFlag + 1] ?? "").split(",").map((name) => name.trim()).filter(Boolean);
      const [command, ...args] = positional;

      if (command === undefined || command === "help") return { exitCode: 0, stdout: USAGE };
      if (!threadId) return { exitCode: 1, stderr: "Run this from a bb thread, or pass --thread <id>." };

      const checkout = await checkoutFor(threadId);
      if (typeof checkout === "string") return { exitCode: 1, stderr: checkout };

      if (command === "hunks") {
        const full = await hunks(checkout, flag("--full"));
        if (full.length <= MAX_HUNKS_OUTPUT) return { exitCode: 0, stdout: full };
        const index = await hunks(checkout, false);
        return {
          exitCode: 0,
          stdout: `${index}\n\nThe full diff is too large to print here. Read hunks with \`git diff\` in the checkout; the numbering above is what to submit.`,
        };
      }

      if (command === "tests") {
        const text = await testsText(checkout, helpers);
        return { exitCode: 0, stdout: text.length <= MAX_HUNKS_OUTPUT ? text : `${text.slice(0, MAX_HUNKS_OUTPUT)}\n\n(cut short at ${MAX_HUNKS_OUTPUT} characters)` };
      }

      if (command === "submit") {
        const source = args.join(" ").trim();
        if (!source) return { exitCode: 1, stderr: "Pass the grouping as a file path or as JSON." };
        let raw: unknown;
        try {
          // The checkout is on this machine (checkoutFor checked), so a path is read here.
          raw = JSON.parse(source.startsWith("{") ? source : await readFile(path.resolve(ctx.cwd ?? checkout.root, source), "utf8"));
        } catch (cause) {
          return { exitCode: 1, stderr: `Could not read the grouping: ${(cause as Error).message}` };
        }
        const result = await submit(store, threadId, checkout, raw, new Date());
        if (result.ok) bb.realtime.publish(REVIEW_CHANGED, { threadId });
        return result.ok ? { exitCode: 0, stdout: result.text } : { exitCode: 1, stderr: result.text };
      }

      if (command === "verify") {
        const result = await verifyData(store, threadId, checkout);
        const stdout = flag("--json") ? JSON.stringify(result) : result.text;
        return { exitCode: result.ok ? 0 : 1, stdout };
      }

      return { exitCode: 1, stderr: `Unknown command "${command}".\n\n${USAGE}` };
    },
  });
}

// bb-plugin-super-diff — backend.
//
// Three surfaces over review/service.ts: the panel (over RPC), the
// `bb super-diff` CLI the agent groups with, and the skill in
// skills/super-diff/SKILL.md that tells it how. A submit publishes a realtime
// signal so the open panel refetches.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { REVIEW_CHANGED, rpcShape, type ReviewResult } from "./review/contract";
import { toplevel } from "./review/git";
import { getView, hunks, setViewed, submit, testsText, verifyData, type BbFiles, type Checkout } from "./review/service";
import { createStore, MIGRATIONS } from "./review/store";

export const rpcContract = defineRpcContract(rpcShape);

/** What the Generate button sends to the thread. The skill does the rest. */
export const GENERATE_PROMPT =
  "Use the super-diff skill to group this branch's changes into concerns for review, then submit the grouping with `bb super-diff submit`.";

/** Leave room under the CLI's 1 MiB output limit for the header lines. */
const MAX_HUNKS_OUTPUT = 900_000;

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
      return { state: "ok", view: await getView(store, threadId, checkout, bbFilesFor(checkout.environmentId)) };
    },
    review_set_viewed: async ({ threadId, path, hunks, viewed }) => {
      const checkout = await checkoutFor(threadId);
      if (typeof checkout === "string") throw new Error(checkout);
      await setViewed(store, threadId, checkout, path, hunks, viewed);
      return { ok: true as const };
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

// Super Diff's server: stores one Super Diff per thread and diff
// target, asks the thread's agent to write one, and gives that agent the
// `bb super-diff` command to read the diff and submit.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { GUIDE } from "./guide";
import {
  anchorLines,
  isPlacedByRule,
  patchHash,
  targetKey,
  validateSubmission,
  type DiffFile,
  type DiffTarget,
  type StoredSuperDiff,
} from "./grouping";

const PATCH_BATCH = 50;
const MAX_OUTPUT = 900_000;

// The id `super-diff` once belonged to v1, whose database still holds these
// five migrations. bb rejects a changed or reused index, so they stay first,
// unchanged, and the next ones drop v1's tables.
const MIGRATIONS = [
  `CREATE TABLE groupings (
    thread_id TEXT PRIMARY KEY,
    grouping_json TEXT NOT NULL,
    assignments_json TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    grouped_at TEXT NOT NULL
  )`,
  `CREATE TABLE snapshot_files (
    thread_id TEXT NOT NULL,
    path TEXT NOT NULL,
    hash TEXT,
    content TEXT,
    PRIMARY KEY (thread_id, path)
  )`,
  `CREATE TABLE viewed (
    thread_id TEXT NOT NULL,
    path TEXT NOT NULL,
    hash TEXT NOT NULL,
    PRIMARY KEY (thread_id, path)
  )`,
  `DROP TABLE viewed`,
  `CREATE TABLE viewed_items (
    thread_id TEXT NOT NULL,
    path TEXT NOT NULL,
    idx INTEGER NOT NULL,
    hash TEXT NOT NULL,
    PRIMARY KEY (thread_id, path, idx)
  )`,
  `DROP TABLE groupings`,
  `DROP TABLE snapshot_files`,
  `DROP TABLE viewed_items`,
  `CREATE TABLE super_diffs (
    thread_id TEXT NOT NULL,
    target_key TEXT NOT NULL,
    stored_json TEXT NOT NULL,
    PRIMARY KEY (thread_id, target_key)
  )`,
  `CREATE TABLE generate_requests (
    thread_id TEXT PRIMARY KEY,
    target_json TEXT NOT NULL,
    requested_at TEXT NOT NULL
  )`,
  // One row per Explain this click: the hidden fork writing the note, and the
  // thread, diff, and line it is for. Deleted when the note is stored.
  `CREATE TABLE explain_requests (
    fork_thread_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    target_key TEXT NOT NULL,
    target_json TEXT NOT NULL,
    path TEXT NOT NULL,
    line INTEGER NOT NULL,
    requested_at TEXT NOT NULL
  )`,
];

/** An Explain this request older than this is treated as lost: its card goes, and the line can be asked again. */
const EXPLAIN_TIMEOUT_MS = 10 * 60_000;

const targetSchema = z.union([
  z.object({ type: z.enum(["all", "branch_committed"]), mergeBaseBranch: z.string().min(1) }),
  z.object({ type: z.literal("uncommitted") }),
]);

export const rpcContract = defineRpcContract({
  superdiff_get: {
    input: z.object({ threadId: z.string().min(1), target: targetSchema }),
    output: z.object({
      stored: z.string().nullable(),
      requestedAt: z.string().nullable(),
      /** Explain this requests still being written, for this diff. */
      explaining: z.array(z.object({ path: z.string(), line: z.number(), requestedAt: z.string() })),
    }),
  },
  superdiff_explain: {
    input: z.object({
      threadId: z.string().min(1),
      target: targetSchema,
      path: z.string().min(1),
      line: z.number().int().positive(),
      text: z.string(),
    }),
    output: z.object({ requestedAt: z.string() }),
  },
  superdiff_generate: {
    input: z.object({ threadId: z.string().min(1), target: targetSchema }),
    output: z.object({ requestedAt: z.string() }),
  },
});

const USAGE = [
  "Usage:",
  "  bb super-diff guide                 How to write a Super Diff (read this first)",
  "  bb super-diff files                 Every changed file, and which ones the plugin places itself",
  "  bb super-diff patch <path>...       The patches for those paths",
  "  bb super-diff submit <file | json>  Check a Super Diff and store it if it passes",
  "  bb super-diff explain <file | json> Store one annotation asked for with Explain this (in its fork only)",
  "",
  "Each command acts on the thread it runs in, and on the diff its Generate button asked for.",
].join("\n");

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);

  const selectStored = db.prepare<[string, string], { stored_json: string }>(
    "SELECT stored_json FROM super_diffs WHERE thread_id = ? AND target_key = ?",
  );
  const upsertStored = db.prepare(
    `INSERT INTO super_diffs (thread_id, target_key, stored_json) VALUES (?, ?, ?)
     ON CONFLICT (thread_id, target_key) DO UPDATE SET stored_json = excluded.stored_json`,
  );
  const selectRequest = db.prepare<[string], { target_json: string; requested_at: string }>(
    "SELECT target_json, requested_at FROM generate_requests WHERE thread_id = ?",
  );
  const upsertRequest = db.prepare(
    `INSERT INTO generate_requests (thread_id, target_json, requested_at) VALUES (?, ?, ?)
     ON CONFLICT (thread_id) DO UPDATE SET target_json = excluded.target_json, requested_at = excluded.requested_at`,
  );

  type ExplainRow = { fork_thread_id: string; thread_id: string; target_key: string; target_json: string; path: string; line: number; requested_at: string };
  const selectExplainByFork = db.prepare<[string], ExplainRow>("SELECT * FROM explain_requests WHERE fork_thread_id = ?");
  const selectExplains = db.prepare<[string, string], ExplainRow>(
    "SELECT * FROM explain_requests WHERE thread_id = ? AND target_key = ? ORDER BY requested_at",
  );
  const insertExplain = db.prepare(
    `INSERT INTO explain_requests (fork_thread_id, thread_id, target_key, target_json, path, line, requested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const deleteExplain = db.prepare("DELETE FROM explain_requests WHERE fork_thread_id = ?");
  const deleteStaleExplains = db.prepare("DELETE FROM explain_requests WHERE requested_at < ?");

  /** The thread's environment and the base its diff compares against, or why there is none. */
  async function environmentOf(threadId: string): Promise<{ environmentId: string; mergeBaseBranch: string } | string> {
    const thread = await bb.sdk.threads.get({ threadId });
    if (!thread.environmentId) return "This thread has no environment to diff.";
    const env = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    const mergeBaseBranch = env.mergeBaseBranch ?? env.baseBranch ?? env.defaultBranch;
    if (!mergeBaseBranch) return "This environment has no base branch to compare against.";
    return { environmentId: thread.environmentId, mergeBaseBranch };
  }

  /** The target the thread's last Generate asked for, or All changes. */
  async function targetFor(threadId: string): Promise<{ environmentId: string; target: DiffTarget } | string> {
    const env = await environmentOf(threadId);
    if (typeof env === "string") return env;
    const request = selectRequest.get(threadId);
    const target = request ? (JSON.parse(request.target_json) as DiffTarget) : { type: "all" as const, mergeBaseBranch: env.mergeBaseBranch };
    return { environmentId: env.environmentId, target };
  }

  async function listFiles(environmentId: string, target: DiffTarget): Promise<DiffFile[] | string> {
    const query = target.type === "uncommitted" ? { target: "uncommitted" as const } : { target: target.type, mergeBaseBranch: target.mergeBaseBranch };
    const result = await bb.sdk.environments.diffFiles({ environmentId, ...query });
    if (result.outcome !== "available") return "bb could not list this diff's files.";
    if (result.truncated) return "bb's file list for this diff was cut short, so Super Diff cannot check it.";
    return result.files as DiffFile[];
  }

  async function loadPatches(environmentId: string, target: DiffTarget, paths: string[]): Promise<Map<string, string>> {
    const patches = new Map<string, string>();
    for (let start = 0; start < paths.length; start += PATCH_BATCH) {
      const result = await bb.sdk.environments.diffPatch({ environmentId, target, paths: paths.slice(start, start + PATCH_BATCH) });
      for (const entry of (result as { patches?: Array<{ path: string; patch?: string }> }).patches ?? []) {
        if (typeof entry.patch === "string") patches.set(entry.path, entry.patch);
      }
    }
    return patches;
  }

  function describe(target: DiffTarget): string {
    if (target.type === "uncommitted") return "Uncommitted changes";
    return `${target.type === "all" ? "All changes" : "Committed changes"} against ${target.mergeBaseBranch}`;
  }

  bb.rpc.register(rpcContract, {
    superdiff_get: async ({ threadId, target }) => {
      const row = selectStored.get(threadId, targetKey(target));
      // A request counts only for the diff it asked about: after the thread's
      // base branch changes, an older request is not one this diff waits on.
      const request = selectRequest.get(threadId);
      const forThis = request !== undefined && targetKey(JSON.parse(request.target_json) as DiffTarget) === targetKey(target);
      deleteStaleExplains.run(new Date(Date.now() - EXPLAIN_TIMEOUT_MS).toISOString());
      const explaining = selectExplains
        .all(threadId, targetKey(target))
        .map((entry) => ({ path: entry.path, line: entry.line, requestedAt: entry.requested_at }));
      return { stored: row?.stored_json ?? null, requestedAt: forThis ? request.requested_at : null, explaining };
    },
    superdiff_explain: async ({ threadId, target, path: filePath, line, text }) => {
      if (selectStored.get(threadId, targetKey(target)) === undefined) throw new Error("Generate a Super Diff for this diff first.");
      const requestedAt = new Date().toISOString();
      // A hidden fork has the thread's whole conversation, so it knows why
      // the code changed, and it runs beside the thread's agent rather than
      // queueing behind it. bb's side chat forks the same way.
      const fork = await bb.sdk.threads.fork({
        sourceThreadId: threadId,
        visibility: "hidden",
        title: `Explain ${filePath.split("/").pop()}:${line}`,
        input: [
          {
            type: "text",
            text: [
              `The reviewer is reading this thread's Super Diff and pressed Explain this on line ${line} of ${filePath}:`,
              "",
              "```",
              text,
              "```",
              "",
              `Write one annotation explaining that line: run \`bb super-diff guide\` and follow its rules for annotations, read the patch with \`bb super-diff patch ${filePath}\` and whatever code you need, then store it with \`bb super-diff explain\`, passing JSON like {"title": "...", "body": "...", "anchor": "..."}. The anchor is text from line ${line} (or the line you explain, if it is a better place) that appears once in the file's patch. Explain why the code is the way it is, from what you know of this thread's work, not only what it does. Then stop; do not change any files.`,
            ].join("\n"),
            mentions: [],
          },
        ],
      });
      insertExplain.run(fork.id, threadId, targetKey(target), JSON.stringify(target), filePath, line, requestedAt);
      return { requestedAt };
    },
    superdiff_generate: async ({ threadId, target }) => {
      const requestedAt = new Date().toISOString();
      upsertRequest.run(threadId, JSON.stringify(target), requestedAt);
      await bb.sdk.threads.send({
        threadId,
        input: [
          {
            type: "text",
            text: `Write a new Super Diff for this thread's diff (${describe(target)}), from scratch: run \`bb super-diff guide\` and follow it, then submit with \`bb super-diff submit\`. Do not reuse or resubmit an earlier Super Diff, even if the diff has not changed; read the patches again and write a fresh grouping and fresh annotations.`,
            mentions: [],
          },
        ],
        mode: "queue-if-active",
      });
      return { requestedAt };
    },
  });

  bb.cli.register({
    name: "super-diff",
    summary: "Group this thread's diff by concern, with notes on tricky code, for the Diff tab",
    commands: [
      { name: "guide", summary: "How to write a Super Diff", usage: "bb super-diff guide" },
      { name: "files", summary: "List every changed file", usage: "bb super-diff files" },
      { name: "patch", summary: "Print patches for the given paths", usage: "bb super-diff patch <path>..." },
      { name: "submit", summary: "Check a Super Diff and store it", usage: "bb super-diff submit <file | json>" },
      { name: "explain", summary: "Store one annotation asked for with Explain this", usage: "bb super-diff explain <file | json>" },
    ],

    async run(argv, ctx) {
      const threadFlag = argv.indexOf("--thread");
      const ownThreadId = threadFlag === -1 ? ctx.threadId : argv[threadFlag + 1];
      // In an Explain this fork, every command acts on the thread and diff the
      // reviewer was reading.
      const explain = ownThreadId ? selectExplainByFork.get(ownThreadId) : undefined;
      const threadId = explain?.thread_id ?? ownThreadId;
      const positional = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--thread");
      const [command, ...args] = positional;

      if (command === undefined || command === "help") return { exitCode: 0, stdout: USAGE };
      if (command === "guide") return { exitCode: 0, stdout: GUIDE };
      if (!threadId) return { exitCode: 1, stderr: "Run this from a bb thread, or pass --thread <id>." };

      const resolved = await targetFor(threadId);
      if (typeof resolved === "string") return { exitCode: 1, stderr: resolved };
      const environmentId = resolved.environmentId;
      const target = explain ? (JSON.parse(explain.target_json) as DiffTarget) : resolved.target;
      const files = await listFiles(environmentId, target);
      if (typeof files === "string") return { exitCode: 1, stderr: files };

      if (command === "files") {
        const lines = files.map(
          (file) =>
            `${file.path}${file.previousPath && file.previousPath !== file.path ? ` (renamed from ${file.previousPath})` : ""} (${file.changeKind}, +${file.additions} -${file.deletions})${isPlacedByRule(file) ? " [placed by rule]" : ""}`,
        );
        return { exitCode: 0, stdout: [`${describe(target)}, ${files.length} files`, "", ...lines].join("\n") };
      }

      if (command === "patch") {
        const known = new Set(files.map((file) => file.path));
        const unknown = args.filter((arg) => !known.has(arg));
        if (unknown.length > 0) return { exitCode: 1, stderr: `Not in this diff: ${unknown.join(", ")}` };
        const patches = await loadPatches(environmentId, target, args);
        let out = "";
        const remaining: string[] = [];
        for (const arg of args) {
          const block = `### ${arg}\n${patches.get(arg) ?? "(no patch)"}\n`;
          if (remaining.length > 0 || out.length + block.length > MAX_OUTPUT) remaining.push(arg);
          else out += block;
        }
        if (remaining.length > 0) out += `\nStopped to stay under the output limit. Run again for: ${remaining.join(" ")}`;
        return { exitCode: 0, stdout: out };
      }

      if (command === "submit") {
        const source = args.join(" ").trim();
        if (!source) return { exitCode: 1, stderr: "Pass the Super Diff as a file path or as JSON." };
        let raw: unknown;
        try {
          raw = JSON.parse(source.startsWith("{") ? source : await readFile(path.resolve(ctx.cwd ?? process.cwd(), source), "utf8"));
        } catch (cause) {
          return { exitCode: 1, stderr: `Could not read the Super Diff: ${(cause as Error).message}` };
        }
        const patches = await loadPatches(environmentId, target, files.filter((file) => !isPlacedByRule(file)).map((file) => file.path));
        const result = validateSubmission(raw, files, patches);
        if (!result.ok) return { exitCode: 1, stderr: `Not stored. Fix these and submit again:\n- ${result.problems.join("\n- ")}` };
        const stored: StoredSuperDiff = {
          target,
          submission: result.submission,
          paths: files.map((file) => file.path),
          hashes: Object.fromEntries([...patches].map(([file, patch]) => [file, patchHash(patch)])),
          acceptedAt: new Date().toISOString(),
        };
        upsertStored.run(threadId, targetKey(target), JSON.stringify(stored));
        const ruleCount = files.filter(isPlacedByRule).length;
        return {
          exitCode: 0,
          stdout: `Stored: ${result.submission.concerns.length} concerns, ${result.submission.annotations.length} annotations, ${ruleCount} files placed by rule. The Diff tab shows it now.`,
        };
      }

      if (command === "explain") {
        if (explain === undefined) return { exitCode: 1, stderr: "bb super-diff explain only works in a thread started by Explain this." };
        const source = args.join(" ").trim();
        let raw: unknown;
        try {
          raw = JSON.parse(source.startsWith("{") ? source : await readFile(path.resolve(ctx.cwd ?? process.cwd(), source), "utf8"));
        } catch (cause) {
          return { exitCode: 1, stderr: `Could not read the annotation: ${(cause as Error).message}` };
        }
        const note = raw as { title?: unknown; body?: unknown; anchor?: unknown } | null;
        const problems: string[] = [];
        if (typeof note?.title !== "string" || note.title.trim() === "") problems.push("Give it a title.");
        if (typeof note?.body !== "string" || note.body.trim() === "") problems.push("Give it a body.");
        if (typeof note?.anchor !== "string" || note.anchor.trim() === "") problems.push("Give it an anchor.");
        const patch = (await loadPatches(environmentId, target, [explain.path])).get(explain.path) ?? "";
        if (typeof note?.anchor === "string" && note.anchor.trim() !== "") {
          const lines = anchorLines(patch, note.anchor);
          if (lines.length === 0) problems.push(`The anchor is not on an added or unchanged line of ${explain.path}.`);
          if (lines.length > 1) problems.push(`The anchor appears on ${lines.length} lines (${lines.join(", ")}); add more of the line so it appears once.`);
        }
        const row = selectStored.get(threadId, explain.target_key);
        if (row === undefined) problems.push("This diff no longer has a Super Diff to add the note to.");
        if (problems.length > 0) return { exitCode: 1, stderr: `Not stored. Fix these and run it again:\n- ${problems.join("\n- ")}` };
        const stored = JSON.parse(row!.stored_json) as StoredSuperDiff;
        stored.submission.annotations.push({
          path: explain.path,
          anchor: note!.anchor as string,
          title: (note!.title as string).trim(),
          body: (note!.body as string).trim(),
          asked: true,
        });
        upsertStored.run(threadId, explain.target_key, JSON.stringify(stored));
        deleteExplain.run(ownThreadId!);
        // The fork is hidden already; archiving it once its turn has had time
        // to end keeps it out of searches and thread counts too.
        const forkId = ownThreadId!;
        setTimeout(() => void bb.sdk.threads.archive({ threadId: forkId }).catch(() => {}), 120_000);
        return { exitCode: 0, stdout: "Stored. The note shows under its line in the Super Diff now. You are done; stop here." };
      }

      return { exitCode: 1, stderr: `Unknown command "${command}".\n\n${USAGE}` };
    },
  });
}

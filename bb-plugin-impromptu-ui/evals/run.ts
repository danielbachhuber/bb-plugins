// Runs each case in cases.ts through Claude Code with the thread instructions
// appended to its system prompt, and checks whether the agent publishes a view.
//
//   node evals/run.ts [--samples 3] [--model opus] [--case <id>] [--concurrency 4] [--without-instructions]
//                     [--extra-instructions <file>] [--instructions-at <commit>]
//
// --without-instructions runs the same cases with nothing appended, as a
// control: a case that passes without the instructions does not test them.
//
// --extra-instructions appends a file before the thread instructions, such as
// the CLAUDE.md files and other plugins' sections a real thread also gets.
// Keep that file out of this repository: it holds personal instructions.
//
// --instructions-at runs the instructions as they were at a commit, such as
// the version a thread had when it missed a view, to compare with the
// current text.
//
// Each sample is one `claude -p` run in a temporary directory, with a
// stand-in `bb` first on PATH. The stand-in records every call and answers
// `schema` and `--help` with what the real bb prints, so the agent sees what
// it would in a thread, but nothing is published to one. A task case's directory
// is a small git repository with a local remote; a draft case's is empty.
// The grade reads the record.
//
// It costs one model session per sample and results vary between runs, so it
// is not part of `npm test`. Run it when the instructions change.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { THREAD_INSTRUCTIONS } from "../view/instructions.ts";
import { CASES, type EvalCase } from "./cases.ts";
import { grade } from "./grade.ts";
import { captureBb, claudeProjectDir, installStub, instructionsAt, pool, readCalls } from "./sandbox.ts";

interface Options {
  samples: number;
  model: string;
  caseIds: string[];
  concurrency: number;
  withoutInstructions: boolean;
  extraInstructions?: string;
  /** The thread instructions under test: the current text, or a commit's. */
  instructions: string;
  instructionsAt?: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { samples: 3, model: "opus", caseIds: [], concurrency: 4, withoutInstructions: false, instructions: THREAD_INSTRUCTIONS };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--without-instructions") {
      options.withoutInstructions = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--samples") options.samples = Number(value);
    else if (flag === "--model") options.model = value;
    else if (flag === "--case") options.caseIds.push(value);
    else if (flag === "--concurrency") options.concurrency = Number(value);
    else if (flag === "--extra-instructions") options.extraInstructions = readFileSync(value, "utf8");
    else if (flag === "--instructions-at") options.instructionsAt = value;
    else throw new Error(`Unknown flag ${flag}`);
  }
  return options;
}



function prompt(c: EvalCase): string {
  if (c.files) return c.request;
  const lines = [c.request, "", "---", ""];
  if (c.existingView) {
    lines.push(
      `A view you published earlier is above the composer under the key "${c.existingView.key}":`,
      "",
      "```json",
      c.existingView.json,
      "```",
      "",
    );
  }
  lines.push(
    "The work for this request is done. This is the reply you drafted to end the turn:",
    "",
    c.reply ?? "",
    "",
    "---",
    "",
    "Finish the turn now, as you would in a real thread.",
  );
  return lines.join("\n");
}

interface Sample {
  pass: boolean;
  why: string;
  finalText: string;
}

function appendedPrompt(options: Options): string[] {
  const parts = [options.extraInstructions, options.withoutInstructions ? undefined : options.instructions].filter(Boolean);
  return parts.length ? ["--append-system-prompt", parts.join("\n\n")] : [];
}

/** Writes a task case's files and commits them, with a local remote to push to. */
function setUpRepository(work: string, remote: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) writeFileSync(join(work, path), content);
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=Octocat", "-c", "user.email=octocat@example.com", ...args], {
      cwd,
      stdio: "ignore",
    });
  mkdirSync(remote);
  git(remote, "init", "--bare", "-q", "-b", "main");
  git(work, "init", "-q", "-b", "main");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "Initial commit");
  git(work, "remote", "add", "origin", remote);
  git(work, "push", "-q", "-u", "origin", "main");
}

function runSample(c: EvalCase, options: Options, bbOutput: string): Promise<Sample> {
  const dir = mkdtempSync(join(tmpdir(), `impromptu-eval-${c.id}-`));
  const work = join(dir, "work");
  mkdirSync(work);
  if (c.files) setUpRepository(work, join(dir, "remote.git"), c.files);
  const { bin, log } = installStub(dir);

  const existing = c.existingView ? `${c.existingView.key}: ${JSON.parse(c.existingView.json).title}\n` : "";
  const args = [
    "-p",
    prompt(c),
    "--model",
    options.model,
    ...appendedPrompt(options),
    "--tools",
    ...(c.files ? ["Bash", "Read", "Edit", "Write"] : ["Bash"]),
    "--permission-mode",
    "bypassPermissions",
    "--setting-sources",
    "local",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--max-turns",
    "30",
    "--output-format",
    "json",
  ];

  return new Promise((resolve) => {
    const child = spawn("claude", args, {
      cwd: work,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        EVAL_LOG: log,
        EVAL_BB_OUTPUT: bbOutput,
        EVAL_EXISTING: existing,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => {
      let finalText = "";
      try {
        finalText = JSON.parse(stdout).result ?? "";
      } catch {
        finalText = stdout.slice(-500);
      }
      const calls = readCalls(log);
      rmSync(claudeProjectDir(work), { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
      if (code !== 0 && calls.length === 0 && !finalText) {
        resolve({ pass: false, why: `claude exited ${code}: ${stderr.trim().slice(0, 200)}`, finalText });
        return;
      }
      resolve({ ...grade(c, calls), finalText });
    });
  });
}



async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = options.caseIds.length ? CASES.filter((c) => options.caseIds.includes(c.id)) : CASES;
  if (cases.length === 0) throw new Error(`No case matches ${options.caseIds.join(", ")}`);

  if (options.instructionsAt) options.instructions = await instructionsAt(options.instructionsAt);

  // The stand-in answers `schema` and `--help` with what the real bb prints.
  const bbOutput = captureBb();
  process.on("exit", () => rmSync(bbOutput, { recursive: true, force: true }));

  const tasks = cases.flatMap((c) =>
    Array.from({ length: options.samples }, () => () => runSample(c, options, bbOutput).then((s) => ({ c, s }))),
  );
  const results = await pool(tasks, options.concurrency);

  let failed = 0;
  for (const c of cases) {
    const samples = results.filter((r) => r.c === c).map((r) => r.s);
    const passed = samples.filter((s) => s.pass).length;
    if (passed < samples.length) failed++;
    console.log(`${passed === samples.length ? "PASS" : "FAIL"} ${passed}/${samples.length}  ${c.id}  (expect ${c.expect}; ${c.source})`);
    for (const s of samples.filter((s) => !s.pass)) {
      console.log(`       ${s.why}${s.finalText ? `: "${s.finalText.replace(/\s+/g, " ").slice(-160)}"` : ""}`);
    }
  }
  const control = [
    options.withoutInstructions ? ", without instructions" : "",
    options.extraInstructions ? ", with extra instructions" : "",
    options.instructionsAt ? `, instructions at ${options.instructionsAt}` : "",
  ].join("");
  console.log(`\n${cases.length - failed}/${cases.length} cases passed every sample (${options.samples} each, model ${options.model}${control}).`);
  process.exitCode = failed ? 1 : 0;
}

await main();

// Replays a real Claude Code session up to the reply that should have
// published a view, lets the model write that reply again, and checks whether
// it publishes one. A short case in cases.ts starts fresh, and agents get it
// right; a real thread reaches the same ending after a long session, which is
// when they miss it.
//
//   node evals/replay.ts --session <file.jsonl> --cut-before "<text of the reply>"
//                        [--samples 4] [--model opus] [--concurrency 4]
//                        [--instructions-at <commit> | --as-recorded | --without-instructions]
//                        [--option "<label>=<regex>"]... [--prompt "<text>"]
//
// The session file is the thread's own transcript under ~/.claude/projects.
// It holds private work, so it stays on this machine: pass its path, and
// never copy it or its text into this repository.
//
// The session's first recorded request holds the system prompt the thread
// had: Claude Code's own and every bb plugin's section. The replay sends it
// whole, with the Impromptu UI section replaced by the current text, a
// commit's (--instructions-at), the recorded one (--as-recorded), or nothing
// (--without-instructions).
//
// The resumed session can still see the real checkout its history worked in,
// so it runs in Claude Code's sandbox, which blocks writes outside the
// temporary directories and all network. The report lists any denied tool
// call, since a denial can change how a reply ends.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { THREAD_INSTRUCTIONS } from "../view/instructions.ts";
import type { Option } from "./cases.ts";
import { grade } from "./grade.ts";
import { captureBb, claudeProjectDir, installStub, instructionsAt, pool, readCalls } from "./sandbox.ts";

const SECTION_START = "## Impromptu UI";
const NEXT_SECTION = "The following instructions come from the BB plugin";

// Claude Code's sandbox lets the model run any command, as it would in the
// thread, but write only to its working directory and the temporary
// directories, and reach no network. A commit or push in the real checkout
// fails there.
const SETTINGS = JSON.stringify({
  sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false },
  permissions: { allow: ["Edit(//tmp/**)", "Edit(//private/tmp/**)"] },
});

interface Options {
  session: string;
  cutBefore: string;
  samples: number;
  model: string;
  concurrency: number;
  section: "current" | "commit" | "recorded" | "none";
  commit?: string;
  options: Option[];
  prompt: string;
}

function parseArgs(argv: string[]): Options {
  const options: Partial<Options> & Pick<Options, "samples" | "model" | "concurrency" | "section" | "options" | "prompt"> = {
    samples: 4,
    model: "opus",
    concurrency: 4,
    section: "current",
    options: [],
    // "Continue." sends the model back to re-check the checkout, which has
    // moved on since the session ran, so its ending describes today's state.
    prompt: "Your last check is done. Finish the turn.",
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--as-recorded") {
      options.section = "recorded";
      continue;
    }
    if (flag === "--without-instructions") {
      options.section = "none";
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--session") options.session = value;
    else if (flag === "--cut-before") options.cutBefore = value;
    else if (flag === "--samples") options.samples = Number(value);
    else if (flag === "--model") options.model = value;
    else if (flag === "--concurrency") options.concurrency = Number(value);
    else if (flag === "--prompt") options.prompt = value;
    else if (flag === "--instructions-at") {
      options.section = "commit";
      options.commit = value;
    } else if (flag === "--option") {
      const at = value.indexOf("=");
      if (at < 1) throw new Error(`--option takes "<label>=<regex>", not ${value}`);
      options.options.push({ label: value.slice(0, at), match: new RegExp(value.slice(at + 1), "i") });
    } else throw new Error(`Unknown flag ${flag}`);
  }
  if (!options.session || !options.cutBefore) throw new Error("--session and --cut-before are required");
  return options as Options;
}

interface Entry {
  type?: string;
  sessionId?: string;
  requestId?: string;
  shape?: { system?: { text?: string }[] };
}

/** The transcript up to the reply that contains `cutBefore`, from that reply's first block. */
export function cutSession(lines: string[], cutBefore: string): string[] {
  const target = lines.findIndex((line) => line.includes(cutBefore));
  if (target === -1) throw new Error("No entry in the session contains the --cut-before text");
  const requestId = (JSON.parse(lines[target]) as Entry).requestId;
  const first = lines.findIndex((line) => {
    const entry = JSON.parse(line) as Entry;
    return entry.type === "assistant" && requestId !== undefined && entry.requestId === requestId;
  });
  return lines.slice(0, first === -1 ? target : first);
}

/** The system prompt the session recorded, with its Impromptu UI section replaced. */
export function systemPrompt(lines: string[], section: string | null): string {
  const shape = lines.map((line) => JSON.parse(line) as Entry).find((entry) => entry.type === "api-request-shape")?.shape;
  const system = (shape?.system ?? []).map((block) => block.text ?? "").join("");
  if (!system) throw new Error("The session has no recorded system prompt (api-request-shape)");
  if (section === null) return system;
  const start = system.indexOf(SECTION_START);
  if (start === -1) throw new Error("The recorded system prompt has no Impromptu UI section");
  const end = system.indexOf(NEXT_SECTION, start);
  const replacement = section ? `${section.trimEnd()}\n\n` : "";
  return system.slice(0, start) + replacement + (end === -1 ? "" : system.slice(end));
}

interface Sample {
  pass: boolean;
  why: string;
  finalText: string;
  denied: string[];
}

function runSample(history: string[], system: string, options: Options, bbOutput: string): Promise<Sample> {
  const work = realpathSync(mkdtempSync(join(tmpdir(), "impromptu-replay-")));
  const { bin, log } = installStub(work);
  // Claude Code finds a session to resume in the project directory named for the working directory.
  const projectDir = claudeProjectDir(work);
  mkdirSync(projectDir, { recursive: true });
  const sessionId = randomUUID();
  const sessionFile = join(projectDir, `${sessionId}.jsonl`);
  writeFileSync(
    sessionFile,
    history
      .map((line) => {
        const entry = JSON.parse(line) as Entry;
        if (entry.sessionId) entry.sessionId = sessionId;
        return JSON.stringify(entry);
      })
      .join("\n") + "\n",
  );

  const args = [
    "-p",
    options.prompt,
    "--resume",
    sessionId,
    "--system-prompt",
    system,
    "--model",
    options.model,
    "--tools",
    "Bash,Read,Write,Grep,Glob",
    "--settings",
    SETTINGS,
    "--setting-sources",
    "local",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--max-turns",
    "15",
    "--output-format",
    "json",
  ];

  return new Promise((resolve) => {
    const child = spawn("claude", args, {
      cwd: work,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, EVAL_LOG: log, EVAL_BB_OUTPUT: bbOutput },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", () => {
      let finalText = "";
      let denied: string[] = [];
      try {
        const result = JSON.parse(stdout) as {
          result?: string;
          permission_denials?: { tool_name?: string; tool_input?: { command?: string; file_path?: string } }[];
        };
        finalText = result.result ?? "";
        denied = (result.permission_denials ?? []).map(
          (denial) => `${denial.tool_name}: ${denial.tool_input?.command ?? denial.tool_input?.file_path ?? ""}`.slice(0, 80),
        );
      } catch {
        finalText = (stdout || stderr).slice(-300);
      }
      const calls = readCalls(log);
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
      const graded = grade({ id: "replay", source: "", request: "", expect: "inline", options: options.options }, calls);
      resolve({ ...graded, finalText, denied });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const lines = readFileSync(options.session, "utf8").split("\n").filter(Boolean);
  const history = cutSession(lines, options.cutBefore);
  const section =
    options.section === "current"
      ? THREAD_INSTRUCTIONS
      : options.section === "commit"
        ? await instructionsAt(options.commit ?? "")
        : options.section === "none"
          ? ""
          : null;
  const system = systemPrompt(lines, section);
  const bbOutput = captureBb();
  process.on("exit", () => rmSync(bbOutput, { recursive: true, force: true }));

  const samples = await pool(
    Array.from({ length: options.samples }, () => () => runSample(history, system, options, bbOutput)),
    options.concurrency,
  );
  const passed = samples.filter((sample) => sample.pass).length;
  const label = { current: "current instructions", commit: `instructions at ${options.commit}`, recorded: "recorded instructions", none: "no instructions" }[options.section];
  console.log(`${passed}/${samples.length} replays published the expected view (${label}, model ${options.model}, ${history.length} transcript entries).`);
  for (const sample of samples) {
    console.log(`${sample.pass ? "PASS" : "FAIL"} ${sample.why}: "${sample.finalText.replace(/\s+/g, " ").slice(-160)}"`);
    if (sample.denied.length) console.log(`       denied: ${sample.denied.join("; ")}`);
  }
  process.exitCode = passed === samples.length ? 0 : 1;
}

await main();

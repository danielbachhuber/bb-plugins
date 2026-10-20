// What run.ts and replay.ts share: the stand-in `bb`, and helpers for
// loading instructions and running samples a few at a time.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Call } from "./grade.ts";

// The stand-in for `bb`. It appends one JSON line per call to $EVAL_LOG.
const STUB = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const call = { args };
const ui = args[0] === "impromptu-ui";
const fileAt = args.indexOf("--file");
if (ui && args[1] === "publish" && fileAt !== -1) {
  const path = args[fileAt + 1];
  try { call.view = path === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path, "utf8"); } catch {}
}
fs.appendFileSync(process.env.EVAL_LOG, JSON.stringify(call) + "\\n");
const captured = (name) => process.stdout.write(fs.readFileSync(path.join(process.env.EVAL_BB_OUTPUT, name), "utf8"));
if (ui && args[1] === "schema") {
  captured("schema.json");
} else if (ui && args[1] === "publish" && args.includes("--help")) {
  captured("publish-help.txt");
} else if (ui && (args.includes("--help") || args.length === 1)) {
  captured("help.txt");
} else if (ui && args[1] === "publish") {
  if (call.view === undefined) {
    process.stderr.write("Usage: bb impromptu-ui publish --file <view.json> [--key <name>]\\n");
    process.exit(1);
  }
  let count = 0;
  try { count = JSON.parse(call.view).sections.reduce((n, s) => n + s.items.length, 0); }
  catch (error) { process.stderr.write("Invalid view file: " + error.message + "\\n"); process.exit(1); }
  process.stdout.write("Published (" + count + " items) as view 1. It is above this thread's composer.\\n");
} else if (ui && (args[1] === "list" || args[1] === "state")) {
  process.stdout.write(process.env.EVAL_EXISTING || "This thread has no views.\\n");
}
`;

/** Writes the stand-in `bb` into `<dir>/bin` and an empty call log beside it. */
export function installStub(dir: string): { bin: string; log: string } {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const stub = join(bin, "bb");
  writeFileSync(stub, STUB);
  chmodSync(stub, 0o755);
  const log = join(dir, "calls.jsonl");
  writeFileSync(log, "");
  return { bin, log };
}

/**
 * The directory Claude Code keeps sessions in for a working directory. It
 * makes one for every run, even without saving the session, so remove it
 * after the run.
 */
export function claudeProjectDir(work: string): string {
  return join(homedir(), ".claude", "projects", realpathSync(work).replace(/[^A-Za-z0-9]/g, "-"));
}

export function readCalls(log: string): Call[] {
  return readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Call);
}

/**
 * Saves what the real bb prints for `schema` and `--help` into a new
 * directory, for the stand-in to answer with. The stand-in reads files rather
 * than calling bb, because a sandboxed run cannot reach bb's server.
 */
export function captureBb(): string {
  const dir = mkdtempSync(join(tmpdir(), "impromptu-eval-bb-"));
  const bb = (...args: string[]) => {
    try {
      return execFileSync("bb", args, { encoding: "utf8" });
    } catch (error) {
      return String((error as { stdout?: string }).stdout ?? "");
    }
  };
  writeFileSync(join(dir, "schema.json"), bb("impromptu-ui", "schema"));
  writeFileSync(join(dir, "help.txt"), bb("impromptu-ui", "--help"));
  writeFileSync(join(dir, "publish-help.txt"), bb("impromptu-ui", "publish", "--help"));
  return dir;
}

/** THREAD_INSTRUCTIONS as it was at a commit. */
export async function instructionsAt(commit: string): Promise<string> {
  const source = execFileSync("git", ["show", `${commit}:./view/instructions.ts`], {
    cwd: join(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  const dir = mkdtempSync(join(tmpdir(), "impromptu-eval-instructions-"));
  const file = join(dir, "instructions.ts");
  writeFileSync(file, source);
  try {
    const loaded: { THREAD_INSTRUCTIONS: string } = await import(file);
    return loaded.THREAD_INSTRUCTIONS;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

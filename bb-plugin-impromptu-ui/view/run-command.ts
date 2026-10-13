/**
 * Runs a command action. The panel has already shown the command and the user
 * has confirmed it; this only runs it, bounded in time and in output.
 */
import { spawn } from "node:child_process";

export const COMMAND_TIMEOUT_MS = 120_000;
/** The tail of the output kept on the card. */
export const OUTPUT_CHARS = 4_000;

export interface CommandResult {
  exitCode: number;
  output: string;
}

export function tail(text: string, limit = OUTPUT_CHARS): string {
  return text.length <= limit ? text : `…${text.slice(text.length - limit + 1)}`;
}

export function runCommand(command: string, cwd: string, shell = process.env.SHELL || "/bin/bash"): Promise<CommandResult> {
  return new Promise((resolve) => {
    // A login shell, so the PATH is the one the user's own terminal has.
    const child = spawn(shell, ["-lc", command], { cwd, env: process.env });
    let output = "";
    const collect = (chunk: Buffer) => {
      output = tail(output + chunk.toString("utf8"), OUTPUT_CHARS * 2);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      output += `\n[stopped after ${COMMAND_TIMEOUT_MS / 1000}s]`;
    }, COMMAND_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: 127, output: tail(`${output}${error.message}`) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, output: tail(output.trim()) });
    });
  });
}

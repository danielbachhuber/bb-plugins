// The one module that runs the gws CLI.
import { execFile } from "node:child_process";

/** Runs `gws` with arguments and resolves to its stdout. */
export type GwsRunner = (args: string[]) => Promise<string>;

/** gws is not installed, or not where the gwsPath setting points. */
export class GwsMissingError extends Error {
  constructor(readonly command: string) {
    super(`Could not find \`${command}\`.`);
    this.name = "GwsMissingError";
  }
}

const TIMEOUT_MS = 30_000;

/**
 * Runs through execFile rather than a shell, so a query with quotes or spaces
 * cannot be read as shell syntax.
 */
export function createGwsRunner(command: string): GwsRunner {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(command, args, { maxBuffer: 16 * 1024 * 1024, timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
        if (error === null) return resolve(stdout);
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return reject(new GwsMissingError(command));
        reject(new Error(bestErrorLine(String(stderr)) ?? error.message));
      });
    });
}

/**
 * The most useful line of a failed run's stderr. gws leads with a keyring
 * notice on every run, so the first line is rarely the cause.
 */
export function bestErrorLine(stderr: string): string | null {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("Using keyring"));
  return lines.find((line) => /error|invalid|expired|denied|unauthori[sz]ed/i.test(line)) ?? lines[0] ?? null;
}

/**
 * gws can print a notice ahead of its JSON. Only a line that begins a JSON
 * document counts as the start, so a bracket inside a notice is not mistaken
 * for one.
 */
export function parseJsonOutput<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {}

  const lines = trimmed.split("\n");
  const start = lines.findIndex((line) => /^\s*[[{]/.test(line));
  if (start !== -1) {
    try {
      return JSON.parse(lines.slice(start).join("\n")) as T;
    } catch {}
  }
  const first = trimmed.split("\n")[0]?.slice(0, 60) ?? "";
  throw new Error(`gws did not return JSON (got ${first === "" ? "empty output" : `"${first}"`}).`);
}

export async function runJson<T>(run: GwsRunner, args: string[]): Promise<T> {
  return parseJsonOutput<T>(await run(args));
}

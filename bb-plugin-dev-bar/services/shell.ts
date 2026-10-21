import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_MANIFEST_PATH, MANIFEST_PATH } from "./manifest";

/**
 * The plugin's only file reads and process spawns.
 *
 * Commands run through the user's login shell in the checkout, so `pnpm`,
 * `npm`, and anything else on their PATH resolve the way they do in a
 * terminal.
 */

const OUTPUT_LIMIT = 64 * 1024;

export interface CommandResult {
  exitCode: number | null;
  /** stdout alone, for the status command's JSON. */
  stdout: string;
  /** stdout and stderr interleaved, for showing a failure. */
  output: string;
  timedOut: boolean;
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The committed and local manifests in a checkout, or null for each that is missing. */
export async function readCheckoutManifests(root: string): Promise<{ committed: string | null; local: string | null }> {
  const [committed, local] = await Promise.all([
    readText(join(root, MANIFEST_PATH)),
    readText(join(root, LOCAL_MANIFEST_PATH)),
  ]);
  return { committed, local };
}

export function runCommand(command: string, cwd: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/sh";
    let stdout = "";
    let output = "";
    let timedOut = false;
    const append = (current: string, chunk: Buffer) =>
      current.length >= OUTPUT_LIMIT ? current : current + chunk.toString("utf8");

    const child = spawn(shell, ["-lc", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
      output = append(output, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = append(output, chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    let finished = false;
    const finish = (exitCode: number | null, extra = "") => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // A start command that leaves a detached service holding the pipes
      // open would otherwise keep this waiting for "close" until timeout.
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ exitCode, stdout, output: output + extra, timedOut });
    };
    child.on("error", (error) => finish(null, `\n${error.message}`));
    child.on("exit", (code) => {
      // Let output already written to the pipes arrive before resolving.
      setImmediate(() => finish(code));
    });
  });
}

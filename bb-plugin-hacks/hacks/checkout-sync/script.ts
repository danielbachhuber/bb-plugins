// The sync script boundary, run by the plugin's server: finding a checkout's
// sync script, starting it, and reading how its last run went.
//
// The script runs detached from the plugin's server, because a script such as
// bb-plugins' sync.sh rebuilds and reloads this plugin, which stops the server
// that started it. So the run's state lives in files rather than in memory: a
// small wrapper shell records its pid when it starts and its exit code when it
// ends, and a server that has since restarted reads them back.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findSyncScript, parseRunState, type ScriptRun } from "./rules";

/** Starts the wrapper, detached. Tests replace it. */
export type Launch = (args: {
  cwd: string;
  script: string;
  executable: boolean;
  stateFile: string;
  logFile: string;
}) => void;

// $1 is the script, $2 the state file, $3 the log, $4 whether to exec the
// script directly. A script that is not executable runs under bash, which is
// what a `.sh` script usually expects.
const WRAPPER = `printf 'running %s\\n' "$$" > "$2"
if [ "$4" = yes ]; then "$1"; else /bin/bash "$1"; fi > "$3" 2>&1 < /dev/null
printf 'exit %s\\n' "$?" > "$2"`;

export const launch: Launch = ({ cwd, script, executable, stateFile, logFile }) => {
  const child = spawn("/bin/sh", ["-c", WRAPPER, "sh", script, stateFile, logFile, executable ? "yes" : "no"], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
};

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface SyncScripts {
  /** The last run of the checkout's sync script, or null if it has none or never ran. */
  state(checkout: string): ScriptRun | null;
  /** Starts the checkout's sync script, returning the run, or null if it has none. */
  start(checkout: string): ScriptRun | null;
}

export function createSyncScripts(
  /** Where state files and logs go, one pair per checkout. */
  dir: string,
  run: Launch = launch,
  now: () => number = Date.now,
  alive: (pid: number) => boolean = isAlive,
): SyncScripts {
  function files(checkout: string) {
    const key = createHash("sha1").update(checkout).digest("hex").slice(0, 12);
    return { stateFile: join(dir, `${key}.state`), logFile: join(dir, `${key}.log`) };
  }

  function state(checkout: string): ScriptRun | null {
    const script = findSyncScript((relative) => existsSync(join(checkout, relative)));
    if (script === null) return null;
    const { stateFile, logFile } = files(checkout);
    let text: string;
    let ageMs: number;
    try {
      text = readFileSync(stateFile, "utf8");
      ageMs = now() - statSync(stateFile).mtimeMs;
    } catch {
      return null;
    }
    const parsed = parseRunState(text, ageMs, alive);
    return parsed === null ? null : { script, ...parsed, log: logFile };
  }

  return {
    state,

    start(checkout) {
      const script = findSyncScript((relative) => existsSync(join(checkout, relative)));
      if (script === null) return null;
      const { stateFile, logFile } = files(checkout);
      mkdirSync(dir, { recursive: true });
      writeFileSync(stateFile, "starting\n");
      const path = join(checkout, script);
      let executable = true;
      try {
        accessSync(path, constants.X_OK);
      } catch {
        executable = false;
      }
      run({ cwd: checkout, script: path, executable, stateFile, logFile });
      return { script, state: "running", exitCode: null, log: logFile };
    },
  };
}

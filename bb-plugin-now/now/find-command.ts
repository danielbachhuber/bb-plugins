// Finds a CLI by name when bb's own PATH does not reach it.
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * Where package managers put CLIs. bb started from the Dock or at login gets
 * launchd's PATH, `/usr/bin:/bin:/usr/sbin:/sbin`, which has none of them.
 */
export function fallbackDirs(home: string): string[] {
  return ["/opt/homebrew/bin", "/usr/local/bin", join(home, ".local/bin"), join(home, "bin")];
}

/**
 * Every path `command` could be at, in the order to try them: as given when
 * it names a path, otherwise each PATH directory and then the fallbacks.
 */
export function commandCandidates(command: string, pathEnv: string | undefined, home: string): string[] {
  if (command.includes("/")) return [command];
  const dirs = [...(pathEnv ?? "").split(delimiter).filter((dir) => dir !== ""), ...fallbackDirs(home)];
  return [...new Set(dirs)].map((dir) => join(dir, command));
}

/** The first executable candidate, or `command` unchanged when there is none. */
export function findCommand(command: string, pathEnv = process.env.PATH, home = homedir()): string {
  for (const candidate of commandCandidates(command, pathEnv, home)) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return command;
}

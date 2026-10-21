/**
 * Reads a failed command's output for the cause the user can act on.
 * Pure, so the app can import it without the SDK.
 */

export type Diagnosis =
  /** A program the command calls is missing, as in a checkout whose dependencies are not installed. */
  { kind: "missing-command"; program: string };

const MISSING_COMMAND_PATTERNS = [
  /(?:^|\n)\S*sh: (?:\d+: )?([\w.@/-]+): (?:command )?not found/,
  /(?:^|\n)zsh: command not found: ([\w.@/-]+)/,
  /Command "([\w.@/-]+)" not found/,
];

export function diagnose(output: string): Diagnosis | null {
  for (const pattern of MISSING_COMMAND_PATTERNS) {
    const match = pattern.exec(output);
    if (match?.[1]) return { kind: "missing-command", program: match[1] };
  }
  return null;
}

/** The failure as the contract carries it; repeated here so the app need not import the contract's zod. */
interface FailureLike {
  title: string;
  command: string;
  output: string;
}

function outputBlock(failure: FailureLike): string {
  return failure.output ? `\n\nIt printed:\n\n\`\`\`\n${failure.output}\n\`\`\`` : "";
}

/** The title and first message for a thread that fixes a failure, in the checkout it happened in. */
export function threadRequest(failure: FailureLike): { title: string; prompt: string } {
  const command = failure.command ? ` \`${failure.command}\`` : "";
  const diagnosis = diagnose(failure.output);
  if (diagnosis) {
    return {
      title: "Set up Dev Bar in this checkout",
      prompt:
        `Dev Bar ran${command || " a command"} in this checkout (${failure.title}) and it failed because ` +
        `\`${diagnosis.program}\` isn't installed.` +
        outputBlock(failure) +
        "\n\nGet this checkout ready to run Dev Bar's commands, usually by installing its dependencies. Then run the " +
        "command again, and the manifest's status command, and confirm the status command prints the JSON the dev-bar " +
        "skill describes. Change the Dev Bar manifest only if a command it names is wrong.",
    };
  }
  return {
    title: `Fix: ${failure.title} failed`,
    prompt:
      `Dev Bar ran${command || " a command"} in this checkout (${failure.title}) and it failed.` +
      outputBlock(failure) +
      "\n\nFind out why and fix it, then run the command again to confirm it succeeds. If the cause is in the " +
      "Dev Bar manifest or the status command, follow the dev-bar skill.",
  };
}

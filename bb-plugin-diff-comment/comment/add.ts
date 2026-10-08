// Adding a comment from the CLI, by `path:line`, for the agent to put a
// review point it raised onto the diff.
//
// Pure: the server reads the file and passes its text in. A comment left in
// the panel takes its anchor from the rendered diff; one added here takes it
// from the file in the agent's working directory, which is the new side of
// that same diff.
import type { AnchorContext } from "./types";

/** `src/widget.ts:42` → path and line, or null when it is not that shape. */
export function parseLocation(raw: string): { path: string; line: number } | null {
  const match = /^(.+):(\d+)$/.exec(raw.trim());
  if (match === null) return null;
  const line = Number(match[2]);
  if (!Number.isInteger(line) || line < 1) return null;
  return { path: match[1]!, line };
}

/** The line and its neighbours from a file's text, or null past its end. */
export function anchorFromFile(content: string, line: number): AnchorContext | null {
  const lines = content.split("\n");
  // A file ending in a newline splits into a last empty string, not a line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const index = line - 1;
  if (index < 0 || index >= lines.length) return null;
  return {
    text: lines[index]!,
    before: lines[index - 1] ?? null,
    after: lines[index + 1] ?? null,
  };
}

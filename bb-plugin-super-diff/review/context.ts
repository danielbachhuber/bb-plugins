// The two whole sides bb's diff needs to expand the context around one hunk.
// Pure. bb's diff checks the sides against the patch, so they must describe
// exactly this hunk's change: the new side is the file as it is now, and the
// old side is that file with only this hunk reverted. The context you expand
// into is then the code as it is now, with the file's other hunks applied.

const HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * @param nowText the file as it is on disk
 * @param hunkText one `@@` hunk of the file's diff, header first
 * @returns the old side, and the hunk with its old start renumbered to it; or
 *   null when the hunk is not what the file holds, or a side has no final newline
 */
export function sidesForHunk(nowText: string, hunkText: string): { oldText: string; hunk: string } | null {
  const lines = hunkText.replace(/\n$/, "").split("\n");
  const match = HEADER.exec(lines[0] ?? "");
  if (!match) return null;
  const body = lines.slice(1);
  if (body.some((line) => line.startsWith("\\"))) return null;
  const newStart = Number(match[3]);
  const newCount = match[4] === undefined ? 1 : Number(match[4]);
  const oldSide = body.filter((line) => line.startsWith(" ") || line.startsWith("-")).map((line) => line.slice(1));
  const newSide = body.filter((line) => line.startsWith(" ") || line.startsWith("+")).map((line) => line.slice(1));
  if (newSide.length !== newCount) return null;

  const nowLines = nowText.split("\n");
  // git numbers an empty side from the line before it.
  const at = newCount === 0 ? newStart : newStart - 1;
  if (nowLines.slice(at, at + newCount).join("\n") !== newSide.join("\n")) return null;

  const oldText = [...nowLines.slice(0, at), ...oldSide, ...nowLines.slice(at + newCount)].join("\n");
  const oldStart = oldSide.length === 0 ? at : at + 1;
  const header = `@@ -${oldStart},${oldSide.length} +${newStart},${newCount} @@${match[5]}`;
  return { oldText, hunk: [header, ...body].join("\n") + "\n" };
}

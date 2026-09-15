// Turning a code selection into the opening of a comment.
//
// Selecting a phrase and pressing comment should start the comment with that
// phrase, the way quoting a reply does — you are nearly always commenting
// *about* what you selected, and retyping it is the annoying part.
//
// Pure, so the wording is pinned by tests rather than by trying it in a
// browser. Reading the selection out of the shadow root is the caller's job.

/** Longest selection quoted. Past this it stops being context and becomes the comment. */
const LIMIT = 600;

/**
 * A markdown blockquote of `text`, ending in a blank line so the cursor lands
 * on a fresh paragraph underneath. Empty when there is nothing worth quoting.
 */
export function quoteSelection(text: string, limit: number = LIMIT): string {
  if (text.trim() === "") return "";

  // Leading indentation is an artefact of where the line sat in the file, not
  // something the reader selected on purpose. Strip the common prefix so a
  // quote of deeply nested code does not arrive wrapped in dead space.
  const lines = text.replace(/\s+$/, "").split("\n");
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => /^[ \t]*/.exec(line)![0].length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);

  const body = lines.map((line) => line.slice(common)).join("\n");
  const clipped =
    body.length > limit
      ? `${body.slice(0, limit).replace(/\s+\S*$/, "")}…`
      : body;

  const quoted = clipped
    .split("\n")
    .map((line) => `> ${line}`.replace(/[ \t]+$/, ""))
    .join("\n");

  return `${quoted}\n\n`;
}

// The editing the comment toolbar does to the text in the box: wrapping a
// selection in bold or code, prefixing lines with a list marker, and starting a
// suggestion. Pure, so each button's result is pinned by tests rather than by
// clicking it in a browser. Applying the result to the textarea is the
// editor's job.

/** The text in the box and what is selected in it. */
export interface Selection {
  value: string;
  start: number;
  end: number;
}

/**
 * One replacement in the box: `insert` takes the place of `from`–`to`, then
 * `start`–`end` (positions in the new text) is selected. Kept to a single
 * range so the editor can apply it as one undoable step.
 */
export interface Change {
  from: number;
  to: number;
  insert: string;
  start: number;
  end: number;
}

export type FormatAction =
  | "heading"
  | "bold"
  | "italic"
  | "quote"
  | "code"
  | "link"
  | "numbered"
  | "bulleted"
  | "task";

const WRAPS: Partial<Record<FormatAction, string>> = { bold: "**", italic: "_", code: "`" };
const PREFIXES: Partial<Record<FormatAction, string>> = {
  heading: "### ",
  quote: "> ",
  bulleted: "- ",
  task: "- [ ] ",
};

export function format(action: FormatAction, selection: Selection): Change {
  if (action === "link") return link(selection);
  if (action === "code" && selection.value.slice(selection.start, selection.end).includes("\n")) {
    return fence(selection, "");
  }
  const marker = WRAPS[action];
  if (marker !== undefined) return wrap(selection, marker);
  return prefixLines(selection, action);
}

/** Wraps the selection in `marker`, or unwraps it when it is already wrapped. */
function wrap({ value, start, end }: Selection, marker: string): Change {
  const before = value.slice(start - marker.length, start);
  const after = value.slice(end, end + marker.length);
  const selected = value.slice(start, end);
  if (before === marker && after === marker) {
    return {
      from: start - marker.length,
      to: end + marker.length,
      insert: selected,
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  return {
    from: start,
    to: end,
    insert: `${marker}${selected}${marker}`,
    start: start + marker.length,
    end: end + marker.length,
  };
}

/** `[text](url)`, with `url` selected so typing replaces it. */
function link({ value, start, end }: Selection): Change {
  const text = value.slice(start, end);
  const insert = `[${text}](url)`;
  const urlAt = start + text.length + 3;
  return { from: start, to: end, insert, start: urlAt, end: urlAt + 3 };
}

/** The start of the line `at` is on, and the end of the line `to` is on. */
function lineBounds(value: string, at: number, to: number): [number, number] {
  const from = value.lastIndexOf("\n", at - 1) + 1;
  // A selection that ends just after a newline has not picked up the next line.
  const last = to > at && value[to - 1] === "\n" ? to - 1 : to;
  const next = value.indexOf("\n", last);
  return [from, next === -1 ? value.length : next];
}

/**
 * Adds the list or quote marker to every selected line, or takes it off when
 * every line already has it, as GitHub's toolbar toggles.
 */
function prefixLines({ value, start, end }: Selection, action: FormatAction): Change {
  const [from, to] = lineBounds(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const markerFor = (index: number) =>
    action === "numbered" ? `${index + 1}. ` : (PREFIXES[action] ?? "");
  const has = (line: string, index: number) =>
    action === "numbered" ? /^\d+\. /.test(line) : line.startsWith(markerFor(index));

  const removing = lines.every(has);
  const next = lines.map((line, index) =>
    removing
      ? action === "numbered"
        ? line.replace(/^\d+\. /, "")
        : line.slice(markerFor(index).length)
      : `${markerFor(index)}${line}`,
  );
  const insert = next.join("\n");
  if (start === end) {
    const caret = start - from;
    const shift = removing ? -Math.min(markerFor(0).length, caret) : markerFor(0).length;
    return { from, to, insert, start: start + shift, end: start + shift };
  }
  return { from, to, insert, start: from, end: from + insert.length };
}

/**
 * A fenced block on lines of its own, around the selection, with its content
 * selected. `info` follows the opening fence: `suggestion` or nothing.
 */
function fence({ value, start, end }: Selection, info: string, content?: string): Change {
  const body = content ?? value.slice(start, end).replace(/\n$/, "");
  const lead = start === 0 || value[start - 1] === "\n" ? "" : "\n";
  const trail = value[end] === undefined || value[end] === "\n" ? "" : "\n";
  const open = `${lead}\`\`\`${info}\n`;
  const insert = `${open}${body}\n\`\`\`\n${trail}`;
  const at = start + open.length;
  return { from: start, to: end, insert, start: at, end: at + body.length };
}

/**
 * GitHub's Add a suggestion: a ```suggestion block holding the commented line
 * as it is, with that line selected so it can be edited in place.
 */
export function suggest(selection: Selection, line: string): Change {
  const { value, start, end } = selection;
  // Like GitHub, a suggestion replaces what is selected rather than wrapping
  // it, since the commented line is what the block has to hold.
  return fence({ value, start, end }, "suggestion", line);
}

/** Applies a change to `value`, for the editor's fallback and for tests. */
export function apply(value: string, change: Change): string {
  return value.slice(0, change.from) + change.insert + value.slice(change.to);
}

export type BodyPart = { kind: "markdown"; text: string } | { kind: "suggestion"; lines: string[] };

/** Splits a comment into its prose and its ```suggestion blocks, in order. */
export function splitSuggestions(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  const pattern = /^```suggestion[ \t]*\n([\s\S]*?)^```[ \t]*$\n?/gm;
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const text = body.slice(last, match.index);
    if (text.trim() !== "") parts.push({ kind: "markdown", text });
    const content = match[1]!.replace(/\n$/, "");
    parts.push({ kind: "suggestion", lines: content === "" ? [] : content.split("\n") });
    last = match.index + match[0].length;
  }
  const rest = body.slice(last);
  if (rest.trim() !== "") parts.push({ kind: "markdown", text: rest });
  return parts;
}

/** The keyboard shortcut for each button, as GitHub binds them. */
export function shortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): FormatAction | "suggestion" | null {
  if (!(event.metaKey || event.ctrlKey)) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (key === "." || key === ">") return "quote";
    if (key === "7" || key === "&") return "numbered";
    if (key === "8" || key === "*") return "bulleted";
    if (key === "l") return "task";
    return null;
  }
  if (key === "b") return "bold";
  if (key === "i") return "italic";
  if (key === "e") return "code";
  if (key === "k") return "link";
  if (key === "g") return "suggestion";
  return null;
}

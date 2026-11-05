import { describe, expect, it } from "vitest";
import { apply, format, shortcut, splitSuggestions, suggest, type Change, type Selection } from "./markdown";

/** Writes a selection as text with `[` and `]` around what is selected, or `|` for a caret. */
function show(value: string, start: number, end: number): string {
  if (start === end) return `${value.slice(0, start)}|${value.slice(start)}`;
  return `${value.slice(0, start)}[${value.slice(start, end)}]${value.slice(end)}`;
}

function parse(marked: string): Selection {
  const caret = marked.indexOf("|");
  if (caret !== -1) return { value: marked.replace("|", ""), start: caret, end: caret };
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  return { value: marked.replace("[", "").replace("]", ""), start, end };
}

function run(marked: string, edit: (selection: Selection) => Change): string {
  const selection = parse(marked);
  const change = edit(selection);
  return show(apply(selection.value, change), change.start, change.end);
}

describe("format", () => {
  it("wraps a selection in bold, and unwraps it", () => {
    expect(run("say [this] now", (s) => format("bold", s))).toBe("say **[this]** now");
    expect(run("say **[this]** now", (s) => format("bold", s))).toBe("say [this] now");
  });

  it("puts the caret between empty markers", () => {
    expect(run("a |", (s) => format("italic", s))).toBe("a _|_");
  });

  it("wraps inline code, and fences a selection across lines", () => {
    expect(run("call [gearFor()]", (s) => format("code", s))).toBe("call `[gearFor()]`");
    expect(run("[a\nb]", (s) => format("code", s))).toBe("```\n[a\nb]\n```\n");
  });

  it("selects the url of a new link", () => {
    expect(run("see [the docs]", (s) => format("link", s))).toBe("see [the docs]([url])");
  });

  it("prefixes every selected line, and takes it off again", () => {
    expect(run("[one\ntwo]", (s) => format("bulleted", s))).toBe("[- one\n- two]");
    expect(run("[- one\n- two]", (s) => format("bulleted", s))).toBe("[one\ntwo]");
    expect(run("[one\ntwo]", (s) => format("numbered", s))).toBe("[1. one\n2. two]");
    expect(run("[one]", (s) => format("task", s))).toBe("[- [ ] one]");
  });

  it("prefixes the caret's line and keeps the caret on its word", () => {
    expect(run("first\nsec|ond", (s) => format("quote", s))).toBe("first\n> sec|ond");
    expect(run("he|llo", (s) => format("heading", s))).toBe("### he|llo");
  });
});

describe("suggest", () => {
  const line = "  return gear.teeth * ratio;";

  it("starts a suggestion holding the line, with the line selected", () => {
    expect(run("|", (s) => suggest(s, line))).toBe(`\`\`\`suggestion\n[${line}]\n\`\`\`\n`);
  });

  it("puts the block on a line of its own after prose", () => {
    expect(run("Clamp this.|", (s) => suggest(s, line))).toBe(
      `Clamp this.\n\`\`\`suggestion\n[${line}]\n\`\`\`\n`,
    );
  });
});

describe("splitSuggestions", () => {
  it("separates prose from suggestion blocks, in order", () => {
    expect(splitSuggestions("Clamp it.\n\n```suggestion\nreturn x;\n```\nThanks")).toEqual([
      { kind: "markdown", text: "Clamp it.\n\n" },
      { kind: "suggestion", lines: ["return x;"] },
      { kind: "markdown", text: "Thanks" },
    ]);
  });

  it("reads an empty suggestion as deleting the line", () => {
    expect(splitSuggestions("```suggestion\n```")).toEqual([{ kind: "suggestion", lines: [] }]);
  });

  it("leaves other code blocks to markdown", () => {
    expect(splitSuggestions("```ts\nx\n```")).toEqual([{ kind: "markdown", text: "```ts\nx\n```" }]);
  });
});

describe("shortcut", () => {
  const key = (k: string, shift = false) => ({ key: k, metaKey: true, ctrlKey: false, shiftKey: shift });

  it("binds GitHub's shortcuts", () => {
    expect(shortcut(key("b"))).toBe("bold");
    expect(shortcut(key("g"))).toBe("suggestion");
    expect(shortcut(key("8", true))).toBe("bulleted");
    expect(shortcut({ key: "b", metaKey: false, ctrlKey: false, shiftKey: false })).toBeNull();
  });
});

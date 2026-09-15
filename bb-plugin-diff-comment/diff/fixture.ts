// A jsdom stand-in for what @pierre/diffs renders, used only by tests.
//
// It reproduces the parts diff/dom.ts depends on and nothing else: a
// <code data-code> per side, holding a [data-gutter] and a [data-content]
// whose children line up by position, each carrying `grid-row: span N`.
//
// If a Pierre upgrade changes that shape, this fixture is the thing to update
// first — and the tests that then fail are the ones telling you the real DOM
// assumptions moved. Read DiffHunksRenderer in @pierre/diffs before editing.
//
// Callers run under `// @vitest-environment jsdom` and use the ambient
// document, so nothing here imports jsdom directly.

export interface FixtureLine {
  line: number;
  text: string;
  /** Pierre's own line types; drives which side a unified row belongs to. */
  type?: "context" | "addition" | "deletion" | "change-addition" | "change-deletion";
}

function column(
  doc: Document,
  marker: "unified" | "deletions" | "additions",
  lines: FixtureLine[],
): HTMLElement {
  const code = doc.createElement("code");
  code.setAttribute("data-code", "");
  code.setAttribute(`data-${marker}`, "");

  const gutter = doc.createElement("div");
  gutter.setAttribute("data-gutter", "");
  gutter.setAttribute("style", `grid-row: span ${lines.length}`);

  const content = doc.createElement("div");
  content.setAttribute("data-content", "");
  content.setAttribute("style", `grid-row: span ${lines.length}`);

  for (const entry of lines) {
    const type = entry.type ?? "context";

    const cell = doc.createElement("div");
    cell.setAttribute("data-column-number", String(entry.line));
    cell.setAttribute("data-line-type", type);
    gutter.append(cell);

    const row = doc.createElement("div");
    row.setAttribute("data-line", String(entry.line));
    row.setAttribute("data-line-type", type);
    row.textContent = entry.text;
    content.append(row);
  }

  code.append(gutter, content);
  return code;
}

export interface Fixture {
  host: HTMLElement;
  /** The shadow root bb's diff renders into. */
  root: ShadowRoot;
  columns: HTMLElement[];
}

/** One `<diffs-container>` with an open shadow root, as bb produces. */
export function buildDiff(
  input:
    | { view: "unified"; lines: FixtureLine[] }
    | { view: "split"; old: FixtureLine[]; new: FixtureLine[] },
): Fixture {
  const doc = document;

  const host = doc.createElement("diffs-container");
  doc.body.append(host);
  const root = host.attachShadow({ mode: "open" });

  const pre = doc.createElement("pre");
  pre.setAttribute("data-diff", "");
  const columns =
    input.view === "unified"
      ? [column(doc, "unified", input.lines)]
      : [column(doc, "deletions", input.old), column(doc, "additions", input.new)];
  pre.append(...columns);
  root.append(pre);

  return { host, root, columns };
}

/** `grid-row: span N` for a stack, or null when the style is missing. */
export function spanOf(stack: Element): number | null {
  const match = /grid-row:\s*span\s+(\d+)/.exec(stack.getAttribute("style") ?? "");
  return match === null ? null : Number(match[1]);
}

function directChild(parent: Element, attr: string): Element {
  const found = Array.from(parent.children).find((child) => child.hasAttribute(attr));
  if (found === undefined) throw new Error(`fixture has no [${attr}] child`);
  return found;
}

/** Every column's (gutter, content) child counts, for alignment assertions. */
export function shape(columns: HTMLElement[]): Array<[number, number]> {
  return columns.map((code) => [
    directChild(code, "data-gutter").children.length,
    directChild(code, "data-content").children.length,
  ]);
}

/**
 * A changes-panel card: bb's collapse control carrying the file path, with a
 * diff inside it. This is what `pathForDiff` walks up to find.
 */
export function buildCard(
  path: string,
  input:
    | { view: "unified"; lines: FixtureLine[] }
    | { view: "split"; old: FixtureLine[]; new: FixtureLine[] },
): Fixture & { card: HTMLElement } {
  const fixture = buildDiff(input);

  const card = document.createElement("div");
  const header = document.createElement("div");
  const toggle = document.createElement("button");
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", `Collapse ${path}`);
  header.append(toggle);
  const body = document.createElement("div");
  body.append(fixture.host);
  card.append(header, body);
  document.body.append(card);

  return { ...fixture, card };
}

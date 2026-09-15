// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { pathForDiff, pathFromToggleLabel, threadIdFromPath } from "./locate";

afterEach(() => {
  document.body.replaceChildren();
});

describe("threadIdFromPath", () => {
  it("reads a bare thread route", () => {
    expect(threadIdFromPath("/threads/thr_abc")).toBe("thr_abc");
  });

  it("reads a project-scoped thread route as the same id", () => {
    expect(threadIdFromPath("/projects/proj_1/threads/thr_abc")).toBe("thr_abc");
  });

  it("ignores trailing segments and query strings", () => {
    expect(threadIdFromPath("/threads/thr_abc/changes?file=a.ts")).toBe("thr_abc");
  });

  it("is null off a thread route", () => {
    expect(threadIdFromPath("/settings")).toBeNull();
  });
});

describe("pathFromToggleLabel", () => {
  it("reads both collapse and expand labels", () => {
    expect(pathFromToggleLabel("Collapse src/a.ts")).toBe("src/a.ts");
    expect(pathFromToggleLabel("Expand src/a.ts")).toBe("src/a.ts");
  });

  it("keeps a rename label whole", () => {
    expect(pathFromToggleLabel("Collapse old/a.ts -> new/a.ts")).toBe("old/a.ts -> new/a.ts");
  });

  it("is null for any other label", () => {
    expect(pathFromToggleLabel("Copy path")).toBeNull();
    expect(pathFromToggleLabel(null)).toBeNull();
  });
});

/** One changes-panel card: a header with bb's collapse control, then the diff. */
function card(path: string): { card: HTMLElement; diff: HTMLElement } {
  const root = document.createElement("div");
  const header = document.createElement("div");
  const toggle = document.createElement("button");
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", `Collapse ${path}`);
  header.append(toggle);
  const body = document.createElement("div");
  const diff = document.createElement("diffs-container");
  body.append(diff);
  root.append(header, body);
  return { card: root, diff };
}

describe("pathForDiff", () => {
  it("finds the path from the card holding the diff", () => {
    const { card: node, diff } = card("src/widget.ts");
    document.body.append(node);
    expect(pathForDiff(diff)).toBe("src/widget.ts");
  });

  it("does not take the path from a neighbouring card", () => {
    // The panel renders cards as siblings. Walking too far up the tree finds
    // the first card's label and files every comment under the wrong path.
    const first = card("src/first.ts");
    const second = card("src/second.ts");
    const list = document.createElement("div");
    list.append(first.card, second.card);
    document.body.append(list);
    expect(pathForDiff(second.diff)).toBe("src/second.ts");
  });

  it("ignores a timeline diff", () => {
    const { card: node, diff } = card("src/widget.ts");
    const timeline = document.createElement("div");
    timeline.setAttribute("data-timeline-file-diff", "");
    timeline.append(node);
    document.body.append(timeline);
    expect(pathForDiff(diff)).toBeNull();
  });

  it("is null when there is no card around the diff", () => {
    const diff = document.createElement("diffs-container");
    document.body.append(diff);
    expect(pathForDiff(diff)).toBeNull();
  });
});

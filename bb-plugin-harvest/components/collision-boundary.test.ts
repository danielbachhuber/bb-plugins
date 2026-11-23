// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { paneBoundary } from "./collision-boundary.js";

function box(el: HTMLElement, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

function tree() {
  const pane = document.createElement("div");
  const row = document.createElement("div");
  const trigger = document.createElement("button");
  pane.appendChild(row);
  row.appendChild(trigger);
  document.body.appendChild(pane);
  return { pane, row, trigger };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("paneBoundary", () => {
  it("returns the nearest tall clipping ancestor narrower than the window", () => {
    const { pane, row, trigger } = tree();
    pane.style.overflow = "hidden";
    box(pane, window.innerWidth / 2, 600);
    row.style.overflowX = "auto";
    box(row, 300, 24);
    expect(paneBoundary(trigger)).toBe(pane);
  });

  it("falls back to the window when the clipping ancestor spans it", () => {
    const { pane, trigger } = tree();
    pane.style.overflow = "hidden";
    box(pane, window.innerWidth, 600);
    expect(paneBoundary(trigger)).toBeNull();
  });

  it("falls back to the window when nothing clips", () => {
    const { trigger } = tree();
    expect(paneBoundary(trigger)).toBeNull();
    expect(paneBoundary(null)).toBeNull();
  });
});

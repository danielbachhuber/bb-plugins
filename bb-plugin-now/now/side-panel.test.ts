import { describe, expect, test, vi } from "vitest";

import { hideSidePanel, type PanelNode } from "./side-panel.js";

function node(parentElement: PanelNode | null, button?: { click(): void }): PanelNode {
  return {
    parentElement,
    querySelector: (selectors) => (selectors.includes("Hide right panel") ? (button ?? null) : null),
  };
}

describe("hideSidePanel", () => {
  test("presses the nearest hide button going outward", () => {
    const outer = { click: vi.fn() };
    const inner = { click: vi.fn() };
    const tab = node(node(node(node(null, outer), inner)));
    expect(hideSidePanel(tab)).toBe(true);
    expect(inner.click).toHaveBeenCalledOnce();
    expect(outer.click).not.toHaveBeenCalled();
  });

  test("reports false when there is no hide button", () => {
    expect(hideSidePanel(node(node(null)))).toBe(false);
    expect(hideSidePanel(null)).toBe(false);
  });
});

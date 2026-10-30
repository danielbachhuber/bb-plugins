// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ViewedProgress, viewedRingSvg } from "./viewed-ring";

afterEach(cleanup);

describe("viewedRingSvg", () => {
  it("hides the arc when nothing is viewed", () => {
    expect(viewedRingSvg(0, 5)).toContain('stroke-opacity="0"/>');
  });

  it("fills part of the ring in the primary color", () => {
    const svg = viewedRingSvg(3, 6);
    expect(svg).toContain("var(--primary)");
    expect(svg).toContain('stroke-dasharray="18.85 37.70"');
  });

  it("turns green once every file is viewed", () => {
    expect(viewedRingSvg(6, 6)).toContain("var(--success)");
  });
});

describe("ViewedProgress", () => {
  it("shows the count beside the ring", () => {
    render(<ViewedProgress viewed={3} total={6} />);
    expect(screen.getByTitle("3 of 6 files viewed").textContent).toBe("3/6 viewed");
  });
});

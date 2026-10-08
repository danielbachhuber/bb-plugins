// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SidebarCount } from "./sidebar-count";

afterEach(cleanup);

describe("SidebarCount", () => {
  it("puts the urgent rows in a red circle before the total", () => {
    render(<SidebarCount urgent={2} total={5} urgentLabel="2 need you" totalLabel="5 in the list" />);
    expect(screen.getByTitle("2 need you")).toHaveClass("bg-red-600");
    expect(screen.getByTitle("2 need you")).toHaveTextContent("2");
    expect(screen.getByTitle("5 in the list")).toHaveTextContent("5");
  });

  it("leaves the circle out at zero", () => {
    const { container } = render(<SidebarCount urgent={0} total={3} urgentLabel="none" totalLabel="3" />);
    expect(screen.queryByTitle("none")).toBeNull();
    expect(container.textContent).toBe("3");
  });

  it("draws nothing at a total of zero", () => {
    const { container } = render(<SidebarCount urgent={0} total={0} urgentLabel="" totalLabel="" />);
    expect(container.textContent).toBe("");
  });
});

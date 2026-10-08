// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SidebarCount, SidebarLevels } from "./sidebar-count";

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

  it("puts the rows due soon in an amber circle between the red one and the total", () => {
    const { container } = render(
      <SidebarCount urgent={2} soon={3} total={9} urgentLabel="2 need you" soonLabel="3 due today" totalLabel="9" />,
    );
    expect(screen.getByTitle("3 due today")).toHaveClass("bg-amber-500");
    expect(container.textContent).toBe("239");
  });

  it("draws nothing at a total of zero", () => {
    const { container } = render(<SidebarCount urgent={0} total={0} urgentLabel="" totalLabel="" />);
    expect(container.textContent).toBe("");
  });
});

describe("SidebarLevels", () => {
  it("puts warnings in an amber circle before errors in a red one", () => {
    const { container } = render(<SidebarLevels warning={2} error={1} warningLabel="2 warn" errorLabel="1 error" />);
    expect(screen.getByTitle("2 warn")).toHaveClass("bg-amber-500");
    expect(screen.getByTitle("1 error")).toHaveClass("bg-red-600");
    expect(container.textContent).toBe("21");
  });

  it("leaves out a circle at zero, and draws nothing when both are", () => {
    const { container, rerender } = render(<SidebarLevels warning={0} error={3} warningLabel="none" errorLabel="3" />);
    expect(screen.queryByTitle("none")).toBeNull();
    expect(container.textContent).toBe("3");
    rerender(<SidebarLevels warning={0} error={0} warningLabel="" errorLabel="" />);
    expect(container.textContent).toBe("");
  });
});

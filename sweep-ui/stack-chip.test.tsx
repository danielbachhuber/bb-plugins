// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StackChip } from "./stack-chip";

afterEach(cleanup);

describe("StackChip", () => {
  it("says where a stacked pull request sits and links to the one below", () => {
    render(<StackChip stack={{ index: 3, size: 4, on: { number: 612, url: "https://github.com/acme/widgets/pull/612" } }} />);
    expect(screen.getByText(/3 of 4/)).toHaveTextContent("3 of 4 · on #612");
    expect(screen.getByRole("link", { name: "#612" })).toHaveAttribute("href", "https://github.com/acme/widgets/pull/612");
  });

  it("calls the bottom of the stack its base, with no link", () => {
    render(<StackChip stack={{ index: 1, size: 4, on: null }} />);
    expect(screen.getByText(/1 of 4/)).toHaveTextContent("1 of 4 · base");
    expect(screen.queryByRole("link")).toBeNull();
  });
});

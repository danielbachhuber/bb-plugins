// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StackChip } from "./stack-chip";

afterEach(cleanup);

describe("StackChip", () => {
  it("says where a stacked pull request sits, as GitHub writes it, and links to the one below", () => {
    render(<StackChip stack={{ index: 3, size: 4, on: { number: 612, url: "https://github.com/acme/widgets/pull/612" } }} />);
    expect(screen.getByTitle(/3 of 4 in a stack/)).toHaveTextContent("3/4 · on #612");
    expect(screen.getByRole("link", { name: "#612" })).toHaveAttribute("href", "https://github.com/acme/widgets/pull/612");
  });

  it("shows the position alone when nothing open is below, with no link", () => {
    render(<StackChip stack={{ index: 1, size: 4, on: null }} />);
    expect(screen.getByTitle("1 of 4 in a stack")).toHaveTextContent(/^1\/4$/);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

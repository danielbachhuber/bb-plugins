// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  UrlLink: ({ href, ...props }: { href: string } & Record<string, unknown>) => <a href={href} {...props} />,
}));

import { ChecksMenu, type CheckEntry } from "./checks-menu";

afterEach(cleanup);

const checks: CheckEntry[] = [
  { name: "lint", workflow: "Test", outcome: "pass", url: "https://example.test/lint" },
  { name: "unit", workflow: "Test", outcome: "cancelled", url: "https://example.test/unit" },
  { name: "deploy-preview", outcome: "skip" },
  { name: "build", workflow: "Test", outcome: "fail", url: "https://example.test/build" },
];

describe("ChecksMenu", () => {
  it("wraps the count in a button named for the checks", () => {
    render(<ChecksMenu checks={checks} label="1 fail, 1 cancelled, 1 pass, 1 skip">1/3 failing</ChecksMenu>);
    expect(screen.getByRole("button", { name: "Checks: 1 fail, 1 cancelled, 1 pass, 1 skip" })).toHaveTextContent("1/3 failing");
  });

  it("lists every check, failing first, each linking to its details", () => {
    render(<ChecksMenu checks={checks} label="x" defaultOpen>count</ChecksMenu>);
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Test / build", "Test / unit", "Test / lint", "deploy-preview"]);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "https://example.test/build",
      "https://example.test/unit",
      "https://example.test/lint",
    ]);
  });

  it("draws the count alone when there is nothing to list", () => {
    render(<ChecksMenu checks={[]} label="x">count</ChecksMenu>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("count")).toBeInTheDocument();
  });
});

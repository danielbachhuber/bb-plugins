// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  UrlLink: ({ href, ...props }: { href: string } & Record<string, unknown>) => <a href={href} {...props} />,
}));

import { StackMenu, type StackMenuStack } from "./stack-menu";

afterEach(cleanup);

const stack: StackMenuStack = {
  number: 131,
  position: 2,
  size: 3,
  entries: [
    { number: 118, title: "Split the widget registry out of core", url: "https://github.com/acme/widgets/pull/118", state: "merged" },
    { number: 128, title: "Promote widgets into core", url: "https://github.com/acme/widgets/pull/128", state: "open" },
    { number: 133, title: "Drop the old widget loader", url: "https://github.com/acme/widgets/pull/133", state: "open" },
  ],
};

describe("StackMenu", () => {
  it("writes the place as GitHub does, and names the stack", () => {
    render(<StackMenu stack={stack} current={128} />);
    expect(screen.getByRole("button", { name: "Stack #131: 2 of 3" })).toHaveTextContent("2/3");
  });

  it("lists the stack top first, this one marked, each titled on hover", () => {
    render(<StackMenu stack={stack} current={128} defaultOpen />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href")?.split("/").pop())).toEqual(["133", "128", "118"]);
    expect(links[1]).toHaveTextContent("#128· this PR");
    expect(links[0]).toHaveAttribute("title", "#133 Drop the old widget loader");
  });
});

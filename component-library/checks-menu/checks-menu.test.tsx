// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  UrlLink: ({ href, ...props }: { href: string } & Record<string, unknown>) => <a href={href} {...props} />,
}));

import { ChecksMenu, checkDuration, formatDuration, type CheckEntry } from "./checks-menu";

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

  it("shows how long each finished check took, and none for a skipped one", () => {
    const timed: CheckEntry[] = [
      { name: "lint", outcome: "pass", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:02:18Z" },
      { name: "deploy-preview", outcome: "skip", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:00Z" },
    ];
    render(<ChecksMenu checks={timed} label="x" defaultOpen>count</ChecksMenu>);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["lint2m 18s", "deploy-preview"]);
    expect(screen.getByTitle("lint passed in 2m 18s")).toBeInTheDocument();
  });

  it("draws the count alone when there is nothing to list", () => {
    render(<ChecksMenu checks={[]} label="x">count</ChecksMenu>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("count")).toBeInTheDocument();
  });
});

describe("formatDuration", () => {
  it("writes seconds, minutes, and hours the way GitHub does", () => {
    expect(formatDuration(3)).toBe("3s");
    expect(formatDuration(138)).toBe("2m 18s");
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(3840)).toBe("1h 4m");
    expect(formatDuration(7200)).toBe("2h");
  });
});

describe("checkDuration", () => {
  const at = (secs: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, secs)).toISOString();
  const check = (outcome: CheckEntry["outcome"], times: Partial<CheckEntry>): CheckEntry => ({ name: "x", outcome, ...times });

  it("is the time between start and finish", () => {
    expect(checkDuration(check("fail", { startedAt: at(0), completedAt: at(312) }))).toBe("5m 12s");
  });

  it("is the time so far, with an ellipsis, for a running check", () => {
    expect(checkDuration(check("pending", { startedAt: at(0) }), Date.parse(at(178)))).toBe("2m 58s…");
  });

  it("is nothing for a skipped check, a check with no times, or a finish before the start", () => {
    expect(checkDuration(check("skip", { startedAt: at(0), completedAt: at(5) }))).toBeNull();
    expect(checkDuration(check("pass", {}))).toBeNull();
    expect(checkDuration(check("pass", { startedAt: at(10), completedAt: at(0) }))).toBeNull();
    expect(checkDuration(check("pass", { startedAt: at(0) }))).toBeNull();
  });
});

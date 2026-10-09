// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { MinorRelease } from "@/dashboard/contract";

import { ReleasesSection } from "./releases-section";

afterEach(cleanup);

const minor = (tag: string, publishedAt: string, login: string): MinorRelease => ({
  tag,
  url: `https://github.com/acme/widgets/releases/tag/${tag}`,
  publishedAt,
  total: 2,
  kinds: { feat: 1, fix: 1, refactor: 0, chore: 0, deps: 0, none: 0 },
  people: [{ login, merged: 2, reviews: 1 }],
  bot: 0,
  missing: 0,
  patches: [],
});

const releases = {
  published: 2,
  patches: 0,
  minors: [minor("v2.2.0", "2026-10-07T15:00:00Z", "octocat"), minor("v2.1.0", "2026-09-30T15:00:00Z", "hubber")],
};

describe("ReleasesSection", () => {
  it("opens an earlier release under its own row, and closes it again", () => {
    render(<ReleasesSection releases={releases} periodLabel="six weeks" onOpenPerson={() => undefined} />);
    // The newest is in full; the earlier one's people are not drawn yet.
    expect(screen.getByRole("button", { name: "octocat" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "hubber" })).toBeNull();

    const row = screen.getByRole("button", { expanded: false });
    fireEvent.click(row);
    expect(screen.getByRole("button", { name: "hubber" })).toBeTruthy();
    // The newest stays in full above it.
    expect(screen.getByRole("button", { name: "octocat" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByRole("button", { name: "hubber" })).toBeNull();
  });
});

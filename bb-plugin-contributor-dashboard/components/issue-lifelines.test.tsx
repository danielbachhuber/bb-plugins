// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AssignedIssue } from "@/dashboard/contract";

import { AssignedIssues, axisMarks, endWords, issuesLine } from "./issue-lifelines";

// The rows draw bb's own Icon, which needs the runtime bb normally provides.
beforeAll(installTestPluginRuntime);
afterEach(cleanup);

const NOW = Date.parse("2026-10-08T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function issue(number: number, held: number, fields: Partial<AssignedIssue> = {}): AssignedIssue {
  return {
    number,
    title: `Widget issue ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    author: "hubber",
    threadId: null,
    openedAt: ago(held + 10),
    plannedAt: ago(held + 5),
    assignedAt: ago(held),
    updatedAt: ago(held),
    ...fields,
  };
}

describe("endWords", () => {
  it("says nothing has happened once it has been theirs two weeks", () => {
    expect(endWords(issue(1, 20), NOW)).toMatchObject({ held: "theirs 20 days", since: "nothing since", old: false, stuck: false });
  });

  it("leaves a quiet issue taken this week unremarked", () => {
    expect(endWords(issue(1, 3), NOW).since).toBeNull();
  });

  it("names the last change when there was one", () => {
    expect(endWords(issue(1, 60, { updatedAt: ago(20) }), NOW).since).toBe("last change 20 days ago");
    expect(endWords(issue(1, 60, { updatedAt: ago(1) }), NOW).since).toBe("last change yesterday");
  });

  it("flags one theirs over three months with nothing since", () => {
    expect(endWords(issue(1, 101), NOW)).toMatchObject({ old: true, stuck: true });
    expect(endWords(issue(1, 101, { updatedAt: ago(4) }), NOW)).toMatchObject({ old: true, stuck: false });
  });

  it("names a single day in the singular", () => {
    expect(endWords(issue(1, 1), NOW).held).toBe("theirs 1 day");
  });
});

describe("issuesLine", () => {
  it("reads the median and p90 held, and counts the quiet ones past two weeks", () => {
    const issues = [2, 3, 8, 13, 13, 16, 22, 24, 55, 101].map((held, i) => issue(i, held));
    expect(issuesLine(issues, NOW)).toEqual({ median: 16, p90: 101, quiet: 5 });
  });
});

describe("axisMarks", () => {
  it("marks today and the steps that fit, labelling the farthest as ago", () => {
    expect(axisMarks(270, 320).map((mark) => mark.label)).toEqual(["today", "3 months", "6 months ago"]);
  });

  it("keeps a month on a short span", () => {
    expect(axisMarks(45, 320).map((mark) => mark.label)).toEqual(["today", "1 month ago"]);
  });
});

describe("AssignedIssues", () => {
  it("says so when no open issues are assigned", () => {
    render(<AssignedIssues issues={[]} onThread={vi.fn()} now={NOW} />);
    expect(screen.getByText("No open issues are assigned to them.")).not.toBeNull();
  });

  it("pages ten at a time", () => {
    const issues = Array.from({ length: 12 }, (_, i) => issue(100 + i, 40 - i));
    render(<AssignedIssues issues={issues} onThread={vi.fn()} now={NOW} />);
    expect(screen.getByText("1–10 of 12")).not.toBeNull();
    expect(screen.queryByText("Widget issue 111")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Widget issue 111")).not.toBeNull();
  });

  it("starts a thread seeded with what the row says", () => {
    const onThread = vi.fn();
    render(<AssignedIssues issues={[issue(7, 20)]} onThread={onThread} now={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a thread" }));
    expect(onThread).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "issue", number: 7, meta: "theirs 20 days, nothing since" }),
      null,
    );
  });
});

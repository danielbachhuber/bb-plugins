// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ActivityDay } from "@/dashboard/contract";

import { ActivityStrips, columnsOf } from "./activity-strips";

afterEach(cleanup);

/** `count` days from Monday Sep 14, 2026, each with the given counts. */
function days(count: number, each: Partial<ActivityDay> = {}): ActivityDay[] {
  return Array.from({ length: count }, (_, i) => ({
    start: new Date(2026, 8, 14 + i).getTime(),
    opened: 0,
    merged: 0,
    reviewed: 0,
    issuesOpened: 0,
    issuesClosed: 0,
    ...each,
  }));
}

describe("columnsOf", () => {
  it("draws a square per day up to four months", () => {
    expect(columnsOf(days(98))).toHaveLength(98);
  });

  it("draws a square per Monday week past that", () => {
    const columns = columnsOf(days(182));
    expect(columns).toHaveLength(26);
    expect(columns.every((column) => column.days.length === 7)).toBe(true);
  });
});

describe("ActivityStrips", () => {
  it("totals the period and each kind, and names every square", () => {
    render(<ActivityStrips days={days(14, { reviewed: 2, opened: 1 })} span="two weeks" />);
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText(/pull requests, reviews and issues over two weeks/)).toBeTruthy();
    expect(screen.getByText("28")).toBeTruthy();
    expect(screen.getByRole("img", { name: "2 reviews on Mon, Sep 14" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "0 assigned issues closed on Sun, Sep 27" })).toBeTruthy();
  });

  it("names a week's square by its Monday", () => {
    render(<ActivityStrips days={days(182, { merged: 1 })} span="Sep 14 to Mar 14" />);
    expect(screen.getByRole("img", { name: "7 pull requests merged in the week of Sep 14" })).toBeTruthy();
  });
});

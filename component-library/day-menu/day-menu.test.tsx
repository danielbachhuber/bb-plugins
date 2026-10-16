// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayMenu, describeDay, nextMonday, parseDay } from "./day-menu";

afterEach(cleanup);

/** Thursday morning. */
const now = new Date(2026, 9, 15, 9, 30);

describe("describeDay", () => {
  it("says today, tomorrow, a weekday in the next week, then the date", () => {
    expect(describeDay("2026-10-15", now)).toBe("Today");
    expect(describeDay("2026-10-16", now)).toBe("Tomorrow");
    expect(describeDay("2026-10-19", now)).toBe("Monday");
    expect(describeDay("2026-10-22", now)).toBe("Oct 22");
    expect(describeDay("2027-01-06", now)).toBe("Jan 6, 2027");
  });
});

describe("nextMonday", () => {
  it("is the coming Monday, and never today", () => {
    expect(nextMonday(now)).toBe("2026-10-19");
    expect(nextMonday(new Date(2026, 9, 19))).toBe("2026-10-26");
  });
});

describe("parseDay", () => {
  it("reads a weekday, and leaves words that are not a day as undefined", () => {
    expect(parseDay("fri", now)).toBe("2026-10-16");
    expect(parseDay("soon", now)).toBeUndefined();
    expect(parseDay("no date", now)).toBeNull();
  });
});

function menu(onPick = vi.fn()) {
  render(
    <DayMenu
      heading="Snooze until"
      choices={[
        { label: "Tomorrow", day: "2026-10-16" },
        { label: "Next week", day: "2026-10-19" },
      ]}
      describe={(day) => describeDay(day, now)}
      check={(day) => (day > "2026-10-15" ? null : "Too early")}
      onPick={onPick}
      now={now}
      menuLabel="Snooze until"
      inputLabel="Snooze until a day"
    />,
  );
  return onPick;
}

describe("DayMenu", () => {
  it("picks a quick day, with the day in words beside a label that says something else", () => {
    const onPick = menu();
    expect(screen.queryAllByText("Tomorrow")).toHaveLength(1);
    expect(screen.getByText("Monday")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Next week/ }));
    expect(onPick).toHaveBeenCalledWith("2026-10-19");
  });

  it("picks a typed day on Enter, saying which day it read", () => {
    const onPick = menu();
    const box = screen.getByRole("textbox", { name: "Snooze until a day" });
    fireEvent.change(box, { target: { value: "oct 22" } });
    expect(screen.getByText("Oct 22")).toBeInTheDocument();
    fireEvent.submit(box.closest("form")!);
    expect(onPick).toHaveBeenCalledWith("2026-10-22");
  });

  it("says why a typed day cannot be used, and does not pick it", () => {
    const onPick = menu();
    const box = screen.getByRole("textbox", { name: "Snooze until a day" });
    fireEvent.change(box, { target: { value: "today" } });
    expect(screen.getByText("Too early")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "soon" } });
    expect(screen.getByText("Not a date")).toBeInTheDocument();
    fireEvent.submit(box.closest("form")!);
    expect(onPick).not.toHaveBeenCalled();
  });
});

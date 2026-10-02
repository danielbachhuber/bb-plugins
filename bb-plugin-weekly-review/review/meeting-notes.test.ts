import { describe, expect, it } from "vitest";
import { parseHeadingDate } from "./meeting-notes.js";

describe("parseHeadingDate", () => {
  it("reads the heading shapes the reference docs use", () => {
    expect(parseHeadingDate("August 31st", "2026-09-07")).toBe("2026-08-31");
    expect(parseHeadingDate("Sep 4", "2026-09-07")).toBe("2026-09-04");
    expect(parseHeadingDate("September 4, 2026", "2026-09-07")).toBe("2026-09-04");
  });

  it("ignores a leading weekday", () => {
    expect(parseHeadingDate("Wednesday, September 30th, 2026", "2026-09-28")).toBe("2026-09-30");
    expect(parseHeadingDate("Tue Aug 4", "2026-08-03")).toBe("2026-08-04");
  });

  it("still finds no date in a heading that only starts like a weekday", () => {
    expect(parseHeadingDate("Satisfaction survey", "2026-09-07")).toBeNull();
    expect(parseHeadingDate("Weekly agenda", "2026-09-07")).toBeNull();
  });
});

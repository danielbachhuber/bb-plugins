import { describe, expect, it } from "vitest";
import { relativeTime } from "./time";

const NOW = Date.parse("2026-09-14T12:00:00.000Z");

describe("relativeTime", () => {
  it("reads seconds as just now", () => {
    expect(relativeTime("2026-09-14T11:59:40.000Z", NOW)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(relativeTime("2026-09-14T11:45:00.000Z", NOW)).toBe("15m ago");
    expect(relativeTime("2026-09-14T09:00:00.000Z", NOW)).toBe("3h ago");
    expect(relativeTime("2026-09-12T12:00:00.000Z", NOW)).toBe("2d ago");
  });

  it("falls back to a date past a week", () => {
    expect(relativeTime("2026-08-30T12:00:00.000Z", NOW)).toMatch(/Aug/);
  });

  it("does not report a small clock skew as the future", () => {
    expect(relativeTime("2026-09-14T12:00:30.000Z", NOW)).toBe("just now");
  });

  it("is empty for an unparseable timestamp", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});

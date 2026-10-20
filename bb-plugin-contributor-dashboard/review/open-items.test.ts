import { describe, expect, it } from "vitest";

import { openItems } from "./open-items";

function item(number: number, createdAt: string, fields: Record<string, unknown> = {}) {
  return {
    number,
    title: `Widget change ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: "OPEN",
    createdAt,
    author: { login: "octocat" },
    assignees: [],
    ...fields,
  };
}

describe("openItems", () => {
  it("keeps only what is open, oldest first", () => {
    const rows = openItems([
      item(3, "2026-10-01T09:00:00Z"),
      item(1, "2026-09-01T09:00:00Z"),
      item(2, "2026-09-15T09:00:00Z", { state: "MERGED" }),
      item(4, "2026-09-20T09:00:00Z", { state: "CLOSED" }),
    ]);
    expect(rows.map((row) => row.number)).toEqual([1, 3]);
  });

  it("names the author and assignees, and carries a draft", () => {
    const [row] = openItems([
      item(7, "2026-10-01T09:00:00Z", { author: null, assignees: [{ login: "hubber" }], isDraft: true }),
    ]);
    expect(row).toMatchObject({ author: null, assignees: ["hubber"], isDraft: true });
  });

  it("treats an issue, which has no draft field, as not a draft", () => {
    expect(openItems([item(8, "2026-10-01T09:00:00Z")])[0].isDraft).toBe(false);
  });
});

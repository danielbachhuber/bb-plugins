import { describe, expect, it, vi } from "vitest";

import { createNowClient } from "./now-client.js";

const week = { monday: "2026-10-05", heading: "From October 2, 2026", hoursAt: null, items: [] };

describe("now client", () => {
  it("writes the week as weekly-review and reads back what is checked", async () => {
    const callRpc = vi.fn(async ({ outputSchema }) =>
      outputSchema.parse({ items: [{ text: "One", doneAt: "2026-10-06T09:00:00Z" }, { text: "Two", doneAt: null }] }),
    );
    const client = createNowClient({ callRpc } as never, () => {});
    expect(await client.write(week)).toEqual(new Set(["One"]));
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({ pluginId: "now", method: "priorities_set", input: { ...week, source: "weekly-review" } }),
    );
  });

  it("reads no checks for a week Now has none for", async () => {
    const client = createNowClient({ callRpc: async ({ outputSchema }: never) => (outputSchema as any).parse(null) } as never, () => {});
    expect(await client.done("2026-10-05")).toEqual(new Set());
  });

  it("answers null and warns once while Now is unreachable", async () => {
    const warn = vi.fn();
    const client = createNowClient({ callRpc: async () => { throw new Error("Plugin now is not installed"); } } as never, warn);
    expect(await client.done("2026-10-05")).toBeNull();
    expect(await client.write(week)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Now plugin: Plugin now is not installed");
  });
});

// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readLastValue, useLastValue, writeLastValue } from "./last-value";

// Node's own `localStorage` global hides jsdom's, so each test gets one in memory.
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
});

afterEach(() => {
  cleanup();
});

describe("useLastValue", () => {
  it("starts empty when nothing was kept", () => {
    const { result } = renderHook(() => useLastValue<{ rows: number[] }>("acme:listing"));
    expect(result.current[0]).toBeNull();
  });

  it("starts from the value the last mount kept", () => {
    const first = renderHook(() => useLastValue<{ rows: number[] }>("acme:listing"));
    act(() => first.result.current[1]({ rows: [1, 2] }));
    expect(first.result.current[0]).toEqual({ rows: [1, 2] });
    first.unmount();

    const second = renderHook(() => useLastValue<{ rows: number[] }>("acme:listing"));
    expect(second.result.current[0]).toEqual({ rows: [1, 2] });
  });

  it("drops a value another build kept", () => {
    writeLastValue("acme:listing", { rows: [1] }, "https://bb.test/app.js?h=older");
    const { result } = renderHook(() => useLastValue<{ rows: number[] }>("acme:listing"));
    expect(result.current[0]).toBeNull();
  });
});

describe("readLastValue", () => {
  it("reads nothing from storage it cannot parse", () => {
    window.localStorage.setItem("acme:listing", "{not json");
    expect(readLastValue("acme:listing")).toBeNull();
  });

  it("reads nothing from a value kept without a version", () => {
    window.localStorage.setItem("acme:listing", JSON.stringify({ rows: [1] }));
    expect(readLastValue("acme:listing")).toBeNull();
  });
});

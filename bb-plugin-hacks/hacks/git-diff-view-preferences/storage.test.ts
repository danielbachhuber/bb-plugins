// @vitest-environment jsdom
//
// The stored format is a contract with bb, not an internal detail: these are
// the keys and values get-bb/bb#3271 reads. Raw strings, not JSON, and an
// absent key means "never chosen".
//
// Storage is injected rather than taken from `window`, because under Node 26
// Node's own unavailable `localStorage` global shadows jsdom's and
// `window.localStorage` reads as `undefined` inside a jsdom test. The `storage`
// events still come from the real jsdom window.
import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalStoragePrefsStore,
  DISPLAY_MODE_KEY,
  LINE_OVERFLOW_MODE_KEY,
} from "./storage";

let items: Map<string, string>;

const localStorage = {
  getItem: (key: string) => items.get(key) ?? null,
  setItem: (key: string, value: string) => {
    items.set(key, value);
  },
};

beforeEach(() => {
  items = new Map();
});

const store = () =>
  createLocalStoragePrefsStore({
    localStorage,
    addEventListener: (type, listener) =>
      window.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener),
  });

describe("read", () => {
  it("reads nothing when neither key is set, so bb's defaults stand", () => {
    expect(store().read()).toEqual({});
  });

  it("reads both keys", () => {
    localStorage.setItem(DISPLAY_MODE_KEY, "split");
    localStorage.setItem(LINE_OVERFLOW_MODE_KEY, "wrap");
    expect(store().read()).toEqual({ wrap: true, view: "split" });
  });

  it("reads the line overflow enum as the wrap flag", () => {
    localStorage.setItem(LINE_OVERFLOW_MODE_KEY, "scroll");
    expect(store().read()).toEqual({ wrap: false });
  });

  it("treats a value it does not know as unset, never as a default", () => {
    localStorage.setItem(DISPLAY_MODE_KEY, "sidebyside");
    localStorage.setItem(LINE_OVERFLOW_MODE_KEY, "nowrap");
    expect(store().read()).toEqual({});
  });

  it("does not read a JSON-quoted value, which bb would not write", () => {
    localStorage.setItem(DISPLAY_MODE_KEY, '"split"');
    expect(store().read()).toEqual({});
  });
});

describe("write", () => {
  it("stores raw strings in bb's own vocabulary", () => {
    store().write({ wrap: true, view: "split" });
    expect(localStorage.getItem(DISPLAY_MODE_KEY)).toBe("split");
    expect(localStorage.getItem(LINE_OVERFLOW_MODE_KEY)).toBe("wrap");
  });

  it("leaves a key absent for a control the user never chose", () => {
    store().write({ wrap: false });
    expect(localStorage.getItem(DISPLAY_MODE_KEY)).toBeNull();
    expect(localStorage.getItem(LINE_OVERFLOW_MODE_KEY)).toBe("scroll");
  });

  it("round-trips through read", () => {
    const written = { wrap: false, view: "unified" as const };
    store().write(written);
    expect(store().read()).toEqual(written);
  });
});

describe("subscribe", () => {
  it("fires when another window changes a key it cares about", () => {
    let fired = 0;
    const unsubscribe = store().subscribe(() => {
      fired += 1;
    });
    window.dispatchEvent(
      new StorageEvent("storage", { key: DISPLAY_MODE_KEY }),
    );
    expect(fired).toBe(1);

    unsubscribe();
    window.dispatchEvent(
      new StorageEvent("storage", { key: DISPLAY_MODE_KEY }),
    );
    expect(fired).toBe(1);
  });

  it("ignores an unrelated key", () => {
    let fired = 0;
    store().subscribe(() => {
      fired += 1;
    });
    window.dispatchEvent(new StorageEvent("storage", { key: "bb.something" }));
    expect(fired).toBe(0);
  });

  it("fires on a cleared store, which reports a null key", () => {
    let fired = 0;
    store().subscribe(() => {
      fired += 1;
    });
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(fired).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  createLocalStorageRangeStore,
  MAX_THREADS,
  RANGES_KEY,
} from "./storage";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("createLocalStorageRangeStore", () => {
  it("remembers a range per thread", () => {
    const store = createLocalStorageRangeStore({ localStorage: memoryStorage() });
    store.set("thr_a", "uncommitted");
    store.set("thr_b", "branch_committed");
    expect(store.get("thr_a")).toBe("uncommitted");
    expect(store.get("thr_b")).toBe("branch_committed");
    expect(store.get("thr_c")).toBeUndefined();
  });

  it("forgets a thread when All changes is picked, since that is bb's default", () => {
    const localStorage = memoryStorage();
    const store = createLocalStorageRangeStore({ localStorage });
    store.set("thr_a", "uncommitted");
    store.set("thr_a", "all");
    expect(store.get("thr_a")).toBeUndefined();
    expect(JSON.parse(localStorage.data.get(RANGES_KEY)!)).toEqual({});
  });

  it("drops the oldest threads past the cap", () => {
    let clock = 0;
    const store = createLocalStorageRangeStore(
      { localStorage: memoryStorage() },
      () => (clock += 1),
    );
    for (let index = 0; index <= MAX_THREADS; index += 1) {
      store.set(`thr_${index}`, "uncommitted");
    }
    expect(store.get("thr_0")).toBeUndefined();
    expect(store.get("thr_1")).toBe("uncommitted");
    expect(store.get(`thr_${MAX_THREADS}`)).toBe("uncommitted");
  });

  it("reads junk as nothing stored", () => {
    const localStorage = memoryStorage();
    localStorage.data.set(RANGES_KEY, "{not json");
    const store = createLocalStorageRangeStore({ localStorage });
    expect(store.get("thr_a")).toBeUndefined();
    store.set("thr_a", "uncommitted");
    expect(store.get("thr_a")).toBe("uncommitted");
  });

  it("survives a storage that throws", () => {
    const store = createLocalStorageRangeStore({
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(() => store.set("thr_a", "uncommitted")).not.toThrow();
    expect(store.get("thr_a")).toBeUndefined();
  });
});

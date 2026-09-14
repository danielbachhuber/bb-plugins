import { describe, expect, it } from "vitest";
import {
  canSave,
  expectedSha,
  initialState,
  isDirty,
  reduce,
  type EditorEvent,
  type EditorState,
} from "./save";

/** Replay a list of events from the initial state, the way the UI would. */
function run(...events: EditorEvent[]): EditorState {
  return events.reduce(reduce, initialState);
}

const loaded: EditorEvent = {
  type: "load",
  content: "# Plan\n",
  sha256: "aaa",
};

describe("loading", () => {
  it("starts unread, not empty", () => {
    expect(initialState.status).toBe("loading");
    expect(initialState.loaded).toBeNull();
    expect(isDirty(initialState)).toBe(false);
    expect(canSave(initialState)).toBe(false);
  });

  it("seeds the buffer from disk and comes up clean", () => {
    const state = run(loaded);
    expect(state.status).toBe("idle");
    expect(state.buffer).toBe("# Plan\n");
    expect(isDirty(state)).toBe(false);
  });
});

describe("editing", () => {
  it("becomes dirty and savable once the buffer diverges", () => {
    const state = run(loaded, { type: "edit", content: "# Plan\n\nStep one\n" });
    expect(isDirty(state)).toBe(true);
    expect(canSave(state)).toBe(true);
  });

  it("is clean again when an edit is typed back to the original", () => {
    const state = run(
      loaded,
      { type: "edit", content: "# Plans\n" },
      { type: "edit", content: "# Plan\n" },
    );
    expect(isDirty(state)).toBe(false);
    expect(canSave(state)).toBe(false);
  });

  it("clears a failure banner as soon as you type again", () => {
    const state = run(
      loaded,
      { type: "edit", content: "changed" },
      { type: "fail", message: "Host unreachable" },
      { type: "edit", content: "changed more" },
    );
    expect(state.status).toBe("idle");
    expect(state.message).toBeNull();
  });

  // A read that failed leaves `loaded` null, so nothing typed could ever be
  // saved. Clearing the banner there makes a failed read look like an empty
  // file, which is exactly how it looked in the app before this case existed.
  it("keeps a load failure on screen, because that buffer can never be saved", () => {
    const state = run(
      { type: "fail", message: "Path does not exist" },
      { type: "edit", content: "typing into the void" },
    );
    expect(state.status).toBe("error");
    expect(state.message).toBe("Path does not exist");
    expect(canSave(state)).toBe(false);
  });

  it("keeps a conflict on screen while you keep typing", () => {
    const state = run(
      loaded,
      { type: "edit", content: "mine" },
      { type: "save-start" },
      { type: "save-conflict" },
      { type: "edit", content: "mine, extended" },
    );
    expect(state.status).toBe("conflict");
    expect(state.message).toMatch(/changed on disk/i);
  });
});

describe("saving", () => {
  it("refuses a save with nothing to write", () => {
    expect(canSave(run(loaded))).toBe(false);
  });

  it("refuses a second save while one is in flight", () => {
    const state = run(
      loaded,
      { type: "edit", content: "changed" },
      { type: "save-start" },
    );
    expect(canSave(state)).toBe(false);
  });

  it("sends the hash we last saw on disk", () => {
    const state = run(loaded, { type: "edit", content: "changed" });
    expect(expectedSha(state, false)).toBe("aaa");
  });

  it("sends no hash when the user chose to overwrite", () => {
    const state = run(loaded, { type: "edit", content: "changed" });
    expect(expectedSha(state, true)).toBeNull();
  });

  it("goes clean on success and adopts the new hash", () => {
    const state = run(
      loaded,
      { type: "edit", content: "changed" },
      { type: "save-start" },
      { type: "save-ok", content: "changed", sha256: "bbb" },
    );
    expect(state.status).toBe("idle");
    expect(isDirty(state)).toBe(false);
    expect(expectedSha(state, false)).toBe("bbb");
  });

  it("keeps keystrokes that landed mid-write, leaving the file dirty", () => {
    const state = run(
      loaded,
      { type: "edit", content: "first" },
      { type: "save-start" },
      { type: "edit", content: "first and second" },
      { type: "save-ok", content: "first", sha256: "bbb" },
    );
    expect(state.buffer).toBe("first and second");
    expect(isDirty(state)).toBe(true);
    expect(canSave(state)).toBe(true);
  });
});

describe("conflict resolution", () => {
  it("keeps the buffer intact so nothing is lost before the user decides", () => {
    const state = run(
      loaded,
      { type: "edit", content: "my draft" },
      { type: "save-start" },
      { type: "save-conflict" },
    );
    expect(state.buffer).toBe("my draft");
    expect(canSave(state)).toBe(true);
  });

  it("reloading discards the buffer and clears the conflict", () => {
    const state = run(
      loaded,
      { type: "edit", content: "my draft" },
      { type: "save-start" },
      { type: "save-conflict" },
      { type: "reload-start" },
      { type: "load", content: "their draft", sha256: "ccc" },
    );
    expect(state.status).toBe("idle");
    expect(state.buffer).toBe("their draft");
    expect(state.message).toBeNull();
    expect(isDirty(state)).toBe(false);
  });

  it("overwriting clears the conflict and keeps the buffer", () => {
    const state = run(
      loaded,
      { type: "edit", content: "my draft" },
      { type: "save-start" },
      { type: "save-conflict" },
      { type: "save-start" },
      { type: "save-ok", content: "my draft", sha256: "ddd" },
    );
    expect(state.status).toBe("idle");
    expect(state.buffer).toBe("my draft");
    expect(isDirty(state)).toBe(false);
  });
});

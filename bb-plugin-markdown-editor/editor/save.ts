// The editor's save state, as a reducer.
//
// Editing a file that an agent may also be editing has more states than a
// dirty flag can hold: the buffer can differ from disk, a write can be in
// flight while you keep typing, and the host can reject a write because the
// file moved underneath you. Keeping all of that in one pure reducer means
// the rules are readable in one place and testable without a DOM.
//
// The disk hash is the pivot. Every read returns the file's sha256; every
// write sends back the hash it expects to find and the host refuses if
// reality disagrees. `loaded` is therefore not a cache — it is our claim
// about what is on disk, and the only thing a conditional write can be built
// on.

/** What we believe is on disk, from the last successful read or write. */
export interface LoadedFile {
  content: string;
  sha256: string;
}

export type SaveStatus = "loading" | "idle" | "saving" | "conflict" | "error";

export interface EditorState {
  /** Null until the first read lands, so the UI can tell empty from unread. */
  loaded: LoadedFile | null;
  /** What the textarea holds. Diverges from `loaded.content` while editing. */
  buffer: string;
  status: SaveStatus;
  /** Human-readable detail for `error`, or the reason for a `conflict`. */
  message: string | null;
}

export type EditorEvent =
  | { type: "load"; content: string; sha256: string }
  | { type: "edit"; content: string }
  | { type: "save-start" }
  | { type: "save-ok"; content: string; sha256: string }
  | { type: "save-conflict" }
  | { type: "fail"; message: string }
  | { type: "reload-start" };

export const initialState: EditorState = {
  loaded: null,
  buffer: "",
  status: "loading",
  message: null,
};

/** True when the buffer differs from what we believe is on disk. */
export function isDirty(state: EditorState): boolean {
  return state.loaded !== null && state.buffer !== state.loaded.content;
}

/**
 * Saving an unchanged buffer is a no-op the host would happily perform, so
 * the button and the Cmd+S binding both gate on this. A save already in
 * flight blocks a second one: two conditional writes racing means the loser
 * reports a conflict against a hash its own sibling just replaced.
 */
export function canSave(state: EditorState): boolean {
  return isDirty(state) && state.status !== "saving" && state.status !== "loading";
}

/**
 * The hash a save should send. Null means "write unconditionally" — the
 * deliberate overwrite offered after a conflict, where the point is to
 * discard whatever arrived on disk.
 */
export function expectedSha(state: EditorState, force: boolean): string | null {
  if (force) return null;
  return state.loaded?.sha256 ?? null;
}

export function reduce(state: EditorState, event: EditorEvent): EditorState {
  switch (event.type) {
    // A read replaces everything. Reload after a conflict runs through here
    // too, which is what makes "discard my edits" a single event.
    case "load":
      return {
        loaded: { content: event.content, sha256: event.sha256 },
        buffer: event.content,
        status: "idle",
        message: null,
      };

    // Typing clears a stale failure banner but not a conflict: a conflict is
    // a decision the user still owes us, and hiding it the moment they touch
    // a key is how someone overwrites work they never saw.
    //
    // A file that never loaded is the other exception. Clearing that error
    // leaves someone typing into an empty buffer with no banner and a dead
    // Save button, which is how a failed read looks like an empty file.
    case "edit": {
      const clearable = state.status === "error" && state.loaded !== null;
      return {
        ...state,
        buffer: event.content,
        status: clearable ? "idle" : state.status,
        message: clearable ? null : state.message,
      };
    }

    case "save-start":
      return { ...state, status: "saving", message: null };

    // The buffer is deliberately left alone. Keystrokes landing during the
    // write are real edits against the version we just stored, so the file
    // goes straight back to dirty rather than losing them.
    case "save-ok":
      return {
        ...state,
        loaded: { content: event.content, sha256: event.sha256 },
        status: "idle",
        message: null,
      };

    case "save-conflict":
      return {
        ...state,
        status: "conflict",
        message: "This file changed on disk since you opened it.",
      };

    case "fail":
      return { ...state, status: "error", message: event.message };

    case "reload-start":
      return { ...state, status: "loading", message: null };
  }
}

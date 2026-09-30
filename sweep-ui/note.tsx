import { useState } from "react";

import { Icon } from "./icons";

/** The local next-step note, drawn as Now draws it: a muted box starting with "Next". */
export function NoteBox({ note }: { note: string | null }) {
  if (note === null) return null;
  return (
    <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs text-foreground/90">
      <span className="font-medium text-muted-foreground">Next </span>
      {note}
    </p>
  );
}

export interface NoteFieldProps {
  initial: string;
  /** Called with the trimmed text; "" deletes the note. Resolves true once saved. */
  onSave: (body: string) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * A drawer under the action line, as Now opens its editor: a grey panel with
 * the note's one line across the top and Cancel and Save below it on the
 * right. Enter saves and Escape cancels too.
 */
export function NoteField({ initial, onSave, onCancel }: NoteFieldProps) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    // A failed save leaves the field open with the text still in it.
    void onSave(value.trim()).then(
      () => setSaving(false),
      () => setSaving(false),
    );
  };
  return (
    <form
      aria-label="Edit note"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="relative w-full">
        <Icon name="Edit" className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          aria-label="Note"
          placeholder="Next step"
          autoFocus
          value={value}
          disabled={saving}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            } else if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          className="block h-7 w-full min-w-0 rounded-md border border-input bg-background pl-7 pr-2 text-xs text-foreground outline-none focus:border-ring disabled:opacity-60"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="h-7 shrink-0 rounded-md px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="h-7 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

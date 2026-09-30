import { useState } from "react";

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
 * One line in the note's place, with Save and Cancel beside it. Enter saves
 * and Escape cancels too.
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
      className="mt-1.5 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
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
        className="block min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={saving}
        className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={onCancel}
        className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
      >
        Cancel
      </button>
    </form>
  );
}

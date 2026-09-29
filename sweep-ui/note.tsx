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

/** One line in the note's place: Enter saves, Escape cancels. */
export function NoteField({ initial, onSave, onCancel }: NoteFieldProps) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
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
          setSaving(true);
          // A failed save leaves the field open with the text still in it.
          void onSave(value.trim()).then(
            () => setSaving(false),
            () => setSaving(false),
          );
        }
      }}
      className="mt-1.5 block w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring disabled:opacity-60"
    />
  );
}

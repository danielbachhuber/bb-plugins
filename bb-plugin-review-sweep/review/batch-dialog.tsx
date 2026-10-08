import { useEffect, useState } from "react";
import { PullRequestIcon } from "sweep-ui/pull-request";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Row } from "./list-view.js";
import { buildPromptParts } from "./prompt.js";

/** One review to start, with the prompt as it stood when Start was pressed. */
export interface BatchStart {
  row: Row;
  prompt: string;
}

function keyOf(row: Row): string {
  return `${row.repo}#${row.number}`;
}

export interface BatchPickerProps {
  /** The requests that can be started, in list order. */
  rows: Row[];
  /** One clock for every prompt, as the list has one for every age. */
  now: number;
  /** Ticked when the picker opens, keyed `repo#number`. */
  initialPicked?: string[];
  /** Resolves once every start has been tried. */
  onStart: (starts: BatchStart[]) => Promise<void>;
  onCancel: () => void;
}

/**
 * The dialog's body: the requests to tick on the left, and the ticked one
 * last chosen on the right, with the prompt its review will start with.
 *
 * The prompt is only the middle of what the thread receives, the part the
 * composer would open with. The pull request it names comes before it and the
 * rule against posting to GitHub after it, added by the server, so neither can
 * be edited away here.
 */
export function BatchPicker({ rows, now, initialPicked = [], onStart, onCancel }: BatchPickerProps) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(initialPicked));
  const [active, setActive] = useState<string | null>(initialPicked[initialPicked.length - 1] ?? null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);

  // Read from the rows, so a request a sync removed while the dialog was open,
  // such as one whose thread started from elsewhere, is no longer counted.
  const ticked = rows.filter((row) => picked.has(keyOf(row)));
  const shown = rows.find((row) => keyOf(row) === active && picked.has(keyOf(row))) ?? null;

  const promptFor = (row: Row) => edits[keyOf(row)] ?? buildPromptParts(row, now).body;

  const toggle = (row: Row) => {
    const key = keyOf(row);
    const next = new Set(picked);
    if (next.delete(key)) {
      // The column moves to the ticked request above it, or empties.
      if (active === key) {
        const rest = ticked.filter((r) => keyOf(r) !== key);
        setActive(rest.length ? keyOf(rest[rest.length - 1]!) : null);
      }
    } else {
      next.add(key);
      setActive(key);
    }
    setPicked(next);
  };

  const reset = (row: Row) =>
    setEdits((current) => {
      const next = { ...current };
      delete next[keyOf(row)];
      return next;
    });

  const start = async () => {
    setStarting(true);
    try {
      await onStart(ticked.map((row) => ({ row, prompt: promptFor(row) })));
    } finally {
      setStarting(false);
    }
  };

  const count = ticked.length;
  // An emptied prompt would start a review told nothing but which pull request it is.
  const blank = ticked.find((row) => promptFor(row).trim() === "");

  return (
    <>
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px" }}>
        <ul className="max-h-[55vh] divide-y divide-border self-start overflow-y-auto rounded-lg border border-border">
          {rows.map((row) => {
            const key = keyOf(row);
            const isPicked = picked.has(key);
            return (
              <li key={key} className={shown && keyOf(shown) === key ? "bg-accent" : undefined}>
                <div className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox
                    checked={isPicked}
                    onCheckedChange={() => toggle(row)}
                    aria-label={`Pick #${row.number}`}
                  />
                  <span className="flex shrink-0">
                    <PullRequestIcon draft={row.isDraft} />
                  </span>
                  {/* A ticked title shows its prompt; an unticked one ticks it. */}
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    title={row.title}
                    onClick={() => (isPicked ? setActive(key) : toggle(row))}
                  >
                    {row.title}
                  </button>
                  {edits[key] !== undefined ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">edited</span>
                  ) : null}
                  <span className="shrink-0 text-xs text-muted-foreground">#{row.number}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {shown ? (
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-baseline gap-2 text-xs">
              <label htmlFor="review-sweep-batch-prompt" className="font-medium text-foreground">
                Prompt for #{shown.number}
              </label>
              {shown.state === "re-review" ? <span className="text-muted-foreground">re-review</span> : null}
              {edits[keyOf(shown)] !== undefined ? (
                <button
                  type="button"
                  onClick={() => reset(shown)}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                >
                  Reset
                </button>
              ) : null}
            </div>
            <Textarea
              id="review-sweep-batch-prompt"
              value={promptFor(shown)}
              rows={14}
              onChange={(event) => setEdits((current) => ({ ...current, [keyOf(shown)]: event.target.value }))}
              className="text-xs leading-relaxed"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Tick a request to read and edit the prompt its review starts with.
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        {blank ? (
          <span className="mr-auto text-xs text-destructive">The prompt for #{blank.number} is empty.</span>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={count === 0 || starting || blank !== undefined} onClick={() => void start()}>
          {starting ? "Starting…" : count === 0 ? "Start reviews" : `Start ${count} ${count === 1 ? "review" : "reviews"}`}
        </Button>
      </div>
    </>
  );
}

/**
 * Batch's dialog: tick several review requests, read or edit each one's
 * prompt, and start them together. Each starts as Start review would, with
 * the plugin's settings and a new worktree, but without a composer.
 */
export function BatchDialog({
  open,
  onOpenChange,
  ...picker
}: Omit<BatchPickerProps, "onCancel"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Remounted on each open, so a closed dialog's ticks and edits do not come back.
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((count) => count + 1);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Start reviews</DialogTitle>
          <DialogDescription>
            Tick the requests to review. Each starts in a new worktree, with the pull request named before its prompt
            and the rule against posting to GitHub after it.
          </DialogDescription>
        </DialogHeader>
        <BatchPicker key={session} {...picker} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

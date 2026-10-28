// Batch: tick rows from everything the list's filters match, on every page,
// then either copy or open their links, or start one main thread with a
// subthread under it for each. The second step is bb's composer for the main
// thread, as a row's own Start thread opens; the server starts the
// subthreads with whatever the composer was set to.
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { NewThreadRequest } from "@get-bb/plugin-sdk/app";
import { StartThreadError, StartThreadForm } from "@danielbachhuber/bb-plugin-component-library/start-thread";

import type { OpenItem } from "@/dashboard/contract";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import { batchPrompt } from "./thread-seed";

type Kind = "issue" | "pull";

const NOUN = { issue: ["issue", "issues"], pull: ["pull request", "pull requests"] } as const;
/** Browsers block a burst of new tabs past the first few, so Open stops here. */
export const OPEN_LIMIT = 10;

function noun(kind: Kind, count: number): string {
  return NOUN[kind][count === 1 ? 0 : 1];
}

/** A markdown list of the rows' links, one per line. */
export function linksMarkdown(rows: readonly Pick<OpenItem, "number" | "title" | "url">[]): string {
  return rows.map((row) => `- [${row.title} (#${row.number})](${row.url})`).join("\n");
}

/**
 * Ticks `index`, or with shift the range from the last row clicked to it, all
 * set to what `index` becomes. Returns the new ticked set.
 */
export function tickRange(
  rows: readonly { number: number }[],
  ticked: ReadonlySet<number>,
  index: number,
  anchor: number | null,
  shift: boolean,
): Set<number> {
  const next = new Set(ticked);
  const turnOn = !ticked.has(rows[index]!.number);
  const [from, to] = shift && anchor !== null ? [Math.min(anchor, index), Math.max(anchor, index)] : [index, index];
  for (let at = from; at <= to; at += 1) {
    if (turnOn) next.add(rows[at]!.number);
    else next.delete(rows[at]!.number);
  }
  return next;
}

function PickStep({
  kind,
  rows,
  ticked,
  onTicked,
  limit,
  onNext,
}: {
  kind: Kind;
  rows: readonly OpenItem[];
  ticked: ReadonlySet<number>;
  onTicked: (next: Set<number>) => void;
  limit: number;
  onNext: () => void;
}) {
  const anchor = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const picked = rows.filter((row) => ticked.has(row.number));
  const count = picked.length;
  const all = count === rows.length && count > 0;

  const click = (index: number, event: MouseEvent) => {
    event.preventDefault();
    onTicked(tickRange(rows, ticked, index, anchor.current, event.shiftKey));
    anchor.current = index;
  };
  const copy = async () => {
    await navigator.clipboard.writeText(linksMarkdown(picked));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const open = () => {
    for (const row of picked.slice(0, OPEN_LIMIT)) window.open(row.url, "_blank", "noopener");
  };

  return (
    <>
      <div className="min-w-0 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-xs">
          <span className="flex items-center gap-2.5">
            <Checkbox
              checked={all ? true : count === 0 ? false : "indeterminate"}
              onCheckedChange={() => onTicked(all ? new Set() : new Set(rows.map((row) => row.number)))}
              aria-label={`Pick every ${NOUN[kind][0]}`}
            />
            <span className="font-medium tabular-nums">
              {count} of {rows.length} picked
            </span>
          </span>
          <span className="text-muted-foreground">Shift-click picks a range</span>
        </div>
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto text-sm">
          {rows.map((row, index) => {
            const on = ticked.has(row.number);
            return (
              <li key={row.number} className={cn("flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2", on && "bg-accent/60")} onClick={(event) => click(index, event)}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Checkbox checked={on} aria-label={`Pick #${row.number}`} onClick={(event) => {
                    event.stopPropagation();
                    click(index, event);
                  }} />
                  <span className="min-w-0 truncate">
                    <span className="tabular-nums text-muted-foreground">#{row.number}</span> {row.title}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {row.threadId === null ? row.author ?? "" : "has a thread"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" disabled={count === 0} onClick={() => void copy()}>
            <Icon name={copied ? "Check" : "Copy"} className="size-3.5" />
            {copied ? "Copied" : `Copy ${count === 0 ? "" : `${count} `}links`}
          </Button>
          <span title={count > OPEN_LIMIT ? `Opens the first ${OPEN_LIMIT}` : undefined}>
            <Button variant="outline" size="sm" disabled={count === 0} onClick={open}>
              <Icon name="ExternalLink" className="size-3.5" />
              Open on GitHub
            </Button>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {count > limit ? <span className="text-xs text-destructive">At most {limit} at once</span> : null}
          <Button size="sm" disabled={count === 0 || count > limit} onClick={onNext}>
            {count === 0 ? "Start a thread" : `Start a thread for ${count}`}
          </Button>
        </span>
      </div>
    </>
  );
}

export function BatchDialog({
  kind,
  open,
  heading,
  rows,
  error,
  projectId,
  limit,
  onClose,
  onStart,
}: {
  kind: Kind;
  open: boolean;
  /** What the filters show, such as "Drafts nobody is assigned to". */
  heading: string;
  /** Every row the filters match; null while they load. */
  rows: readonly OpenItem[] | null;
  error: string | null;
  projectId: string | null;
  limit: number;
  onClose: () => void;
  /** Throw to keep the dialog open with the draft in it. */
  onStart: (rows: OpenItem[], request: NewThreadRequest) => Promise<void>;
}) {
  const [step, setStep] = useState<"pick" | "compose">("pick");
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  // A closed dialog's ticks do not come back on the next open.
  useEffect(() => {
    if (!open) return;
    setStep("pick");
    setTicked(new Set());
    setFailure(null);
  }, [open]);

  const picked = (rows ?? []).filter((row) => ticked.has(row.number));
  const count = picked.length;
  const plural = noun(kind, count);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            {step === "pick" ? `Batch: ${heading}` : `Start a main thread for ${count} ${plural}`}
          </DialogTitle>
          <DialogDescription className={step === "pick" ? undefined : "sr-only"}>
            {step === "pick"
              ? `Every ${NOUN[kind][0]} the filters match, on every page.`
              : `One main thread, then a subthread under it for each ${NOUN[kind][0]}.`}
          </DialogDescription>
        </DialogHeader>
        {error !== null ? <StartThreadError message={error} /> : null}
        {rows === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : step === "pick" ? (
          <PickStep kind={kind} rows={rows} ticked={ticked} onTicked={setTicked} limit={limit} onNext={() => setStep("compose")} />
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto">
            {failure === null ? null : <StartThreadError message={failure} />}
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">
                {count} {plural}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {picked.map((row) => (
                  <li key={row.number} className="truncate">
                    <span className="tabular-nums">#{row.number}</span> {row.title}
                    {row.author === null ? "" : ` · ${row.author}`}
                  </li>
                ))}
              </ul>
            </div>
            <StartThreadForm
              seed={{ projectId, prompt: batchPrompt(kind, picked) }}
              draftKey={`contributor-dashboard:batch:${kind}:${picked.map((row) => row.number).join(",")}`}
              showPreview={false}
              onSubmit={async (request) => {
                setFailure(null);
                try {
                  await onStart(picked, request);
                } catch (cause) {
                  setFailure(cause instanceof Error ? cause.message : String(cause));
                  throw cause;
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Then {count} {count === 1 ? "subthread starts" : "subthreads start"} under it, one per {NOUN[kind][0]}, each with that{" "}
              {NOUN[kind][0]}&rsquo;s own Start thread prompt and the provider, model, and environment chosen here. A new
              worktree gives each its own.
            </p>
            <button
              type="button"
              onClick={() => setStep("pick")}
              className="cursor-pointer text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              Back to picking
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A visual review inside an opened item: the variations side by side, one
// per screen with the original first, each with a pick toggle and a note box,
// and one Send feedback button for all of it. Kept free of RPC so a story can
// render it with fixture images.
import { useRef, useState, type KeyboardEvent } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hasFeedback, type Feedback } from "./review.js";
import type { Item } from "./schema.js";
import type { ItemRecord } from "./store.js";

export interface ReviewPanelProps {
  item: Item;
  record: ItemRecord | undefined;
  /** A variation's image as a URL; undefined while it loads, null if it is missing. */
  imageUrl: (index: number) => string | null | undefined;
  busy: boolean;
  onSubmit: (feedback: Feedback) => void;
  /** Starting values, for a story; a failed send also starts from what it tried. */
  initial?: Feedback;
}

const noteClass =
  "w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-70";

function VariationImage({ url, label, onZoom }: { url: string | null | undefined; label: string; onZoom: () => void }) {
  if (url === undefined) return <div className="h-40 animate-pulse rounded-md bg-muted" />;
  if (url === null) {
    return <div className="rounded-md bg-muted px-3 py-6 text-center text-xs text-muted-foreground">Image not available</div>;
  }
  return (
    <button type="button" className="block w-full cursor-zoom-in overflow-hidden rounded-md border border-border" onClick={onZoom} title="Open full size">
      <img src={url} alt={label} className="block w-full" />
    </button>
  );
}

/** "A. Sections" becomes "A"; a label with no letter keeps its first word. */
export function shortLabel(label: string): string {
  const lettered = /^([A-Za-z0-9]{1,3})[.):]\s/.exec(label);
  return lettered ? lettered[1]! : (label.split(/\s+/)[0] ?? label);
}

/**
 * The filmstrip's labels: each one short, unless that would name two
 * variations the same. "C. Widgets tab" and "C. Gadgets tab" both shorten to "C",
 * so those show "Widgets tab" and "Gadgets tab" instead.
 */
export function filmstripLabels(labels: string[]): string[] {
  const short = labels.map(shortLabel);
  return labels.map((label, index) =>
    short.filter((other) => other === short[index]).length === 1
      ? short[index]!
      : label.replace(/^[A-Za-z0-9]{1,3}[.):]\s+/, ""),
  );
}

/**
 * A strip of thumbnails that stays at the top of the panel: how many
 * variations there are, which is showing, which is picked, which have notes,
 * and a click to show any of them.
 */
function Filmstrip({
  item,
  imageUrl,
  active,
  pick,
  notes,
  onJump,
}: {
  item: Item;
  imageUrl: (index: number) => string | null | undefined;
  active: number;
  pick: number | null;
  notes: string[];
  onJump: (index: number) => void;
}) {
  const labels = filmstripLabels(item.variations.map((variation) => variation.label));
  return (
    <nav
      aria-label="Variations"
      className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto border-b border-border bg-card/95 px-4 py-2 backdrop-blur"
    >
      {item.variations.map((variation, index) => {
        const url = imageUrl(index);
        return (
          <button
            key={`${index}:${variation.label}`}
            type="button"
            onClick={() => onJump(index)}
            aria-current={active === index ? "true" : undefined}
            title={variation.label}
            className={cn(
              // No focus ring: the highlight already says which is showing.
              "relative flex w-16 shrink-0 flex-col items-center gap-1 rounded-md p-1 text-[11px] outline-none",
              active === index ? "bg-state-active text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "block h-10 w-full overflow-hidden rounded border bg-muted",
                pick === index ? "border-foreground ring-1 ring-foreground" : "border-border",
              )}
            >
              {url ? <img src={url} alt="" className="h-full w-full object-cover object-left-top" /> : null}
            </span>
            <span className="max-w-full truncate">
              {pick === index ? "✓ " : ""}
              {labels[index]}
            </span>
            {notes[index]?.trim() ? (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-foreground" aria-label="Has a note" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function ReviewPanel({ item, record, imageUrl, busy, onSubmit, initial }: ReviewPanelProps) {
  const sent = record?.state === "done" ? record.result?.feedback : undefined;
  const start = sent ?? record?.result?.feedback ?? initial;
  const [pick, setPick] = useState<number | null>(start?.pick ?? null);
  const [notes, setNotes] = useState<string[]>(item.variations.map((_, index) => start?.notes[index] ?? ""));
  const [overall, setOverall] = useState(start?.overall ?? "");
  const [zoomed, setZoomed] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement | null>(null);
  const locked = sent !== undefined || record?.state === "dismissed";
  const feedback: Feedback = { pick, notes, overall };
  const zoomedVariation = zoomed === null ? undefined : item.variations[zoomed];
  const count = item.variations.length;

  // One variation per screen, side by side: flipping between them keeps each
  // image in the same place, so what changed is what moves.
  const show = (index: number) => {
    const next = Math.max(0, Math.min(count - 1, index));
    setActive(next);
    const element = track.current;
    // Instant rather than sliding: a cut between two images makes what
    // changed jump out, where a slide smears it.
    if (element) element.scrollTo({ left: next * element.clientWidth, behavior: "instant" });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      show(active + (event.key === "ArrowRight" ? 1 : -1));
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3" onKeyDown={onKeyDown}>
      <Filmstrip item={item} imageUrl={imageUrl} active={active} pick={pick} notes={notes} onJump={show} />

      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" className="h-7 px-2" disabled={active === 0} onClick={() => show(active - 1)} aria-label="Previous variation">
          ‹
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">
          {active + 1} of {count} · ← → to flip
        </span>
        <Button size="sm" variant="ghost" className="h-7 px-2" disabled={active === count - 1} onClick={() => show(active + 1)} aria-label="Next variation">
          ›
        </Button>
      </div>

      <div
        ref={track}
        tabIndex={0}
        aria-label="Variations, one at a time"
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.clientWidth > 0) setActive(Math.round(element.scrollLeft / element.clientWidth));
        }}
      >
        {item.variations.map((variation, index) => {
          const picked = pick === index;
          return (
            <section
              key={`${index}:${variation.label}`}
              aria-label={variation.label}
              className="w-full shrink-0 snap-start px-4"
            >
              <div className={cn("rounded-lg border p-3", picked ? "border-foreground/60 bg-state-active" : "border-border")}>
                {/* One line above the image, so every image starts at the same height. */}
                <div className="mb-2 flex h-8 items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{variation.label}</div>
                  <Button
                    size="sm"
                    variant={picked ? "default" : "outline"}
                    aria-pressed={picked}
                    disabled={locked || busy}
                    onClick={() => setPick(picked ? null : index)}
                  >
                    {picked ? "Picked" : "Pick this one"}
                  </Button>
                </div>
                <VariationImage url={imageUrl(index)} label={variation.label} onZoom={() => setZoomed(index)} />
                {variation.description === "" ? null : (
                  <div className="mt-2 text-xs text-muted-foreground [&_*]:!text-xs [&_p]:!my-0">
                    <Markdown content={variation.description} />
                  </div>
                )}
                {locked && notes[index]?.trim() === "" ? null : (
                  <textarea
                    aria-label={`Note on ${variation.label}`}
                    placeholder="Note (optional)"
                    className={cn(noteClass, "mt-2")}
                    rows={2}
                    value={notes[index] ?? ""}
                    disabled={locked || busy}
                    onChange={(event) => setNotes((current) => current.map((note, at) => (at === index ? event.target.value : note)))}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>

      {locked && overall.trim() === "" ? null : (
        <textarea
          aria-label="Overall note"
          placeholder="Overall note (optional)"
          className={noteClass}
          rows={2}
          value={overall}
          disabled={locked || busy}
          onChange={(event) => setOverall(event.target.value)}
        />
      )}
      {locked ? null : (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy || !hasFeedback(feedback)} onClick={() => onSubmit(feedback)}>
            {busy ? "Sending…" : "Send feedback"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {pick === null ? "Nothing picked" : `Picked: ${item.variations[pick]?.label}`}
          </span>
        </div>
      )}

      <Dialog open={zoomed !== null} onOpenChange={(open) => (open ? null : setZoomed(null))}>
        <DialogContent className="max-h-[92vh] max-w-[92vw] overflow-auto p-3">
          <DialogTitle className="text-sm">{zoomedVariation?.label}</DialogTitle>
          {zoomed === null ? null : <img src={imageUrl(zoomed) ?? undefined} alt={zoomedVariation?.label} className="max-w-none" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

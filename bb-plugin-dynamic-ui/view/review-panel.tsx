// A visual review inside an opened item: each variation's image, original
// first, with a pick toggle and a note box under it, and one Send feedback
// button for all of it. Kept free of RPC so a story can render it with
// fixture images.
import { useEffect, useRef, useState } from "react";
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
 * A strip of thumbnails that stays at the top of the panel while the review
 * scrolls under it: how many variations there are, which is on screen, which
 * is picked, which have notes, and a click to jump to any of them.
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
              "relative flex w-16 shrink-0 flex-col items-center gap-1 rounded-md p-1 text-[11px]",
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
              {shortLabel(variation.label)}
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
  const locked = sent !== undefined || record?.state === "dismissed";
  const feedback: Feedback = { pick, notes, overall };
  const zoomedVariation = zoomed === null ? undefined : item.variations[zoomed];
  const sections = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(0);
  // A jump keeps its target highlighted while the scroll settles; the last
  // variation may never reach the band, because the panel runs out of room.
  const jumpedAt = useRef(0);

  // The variation on screen is the topmost one whose section crosses the band
  // just under the filmstrip.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (entry.isIntersecting) visible.add(index);
          else visible.delete(index);
        }
        if (visible.size > 0 && Date.now() - jumpedAt.current > 1_000) setActive(Math.min(...visible));
      },
      { rootMargin: "-90px 0px -55% 0px" },
    );
    for (const section of sections.current) if (section) observer.observe(section);
    return () => observer.disconnect();
  }, [item.variations.length]);

  const jump = (index: number) => {
    jumpedAt.current = Date.now();
    setActive(index);
    const section = sections.current[index];
    if (!section) return;
    // Leave room for the filmstrip, which covers the top of the panel.
    section.style.scrollMarginTop = "88px";
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mt-3 flex flex-col gap-4">
      <Filmstrip item={item} imageUrl={imageUrl} active={active} pick={pick} notes={notes} onJump={jump} />
      {item.variations.map((variation, index) => {
        const picked = pick === index;
        return (
          <section
            ref={(element) => {
              sections.current[index] = element;
            }}
            data-index={index}
            key={`${index}:${variation.label}`}
            aria-label={variation.label}
            className={cn("rounded-lg border p-3", picked ? "border-foreground/60 bg-state-active" : "border-border")}
          >
            <div className="mb-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{variation.label}</div>
                {variation.description === "" ? null : (
                  <div className="text-xs text-muted-foreground [&_*]:!text-xs [&_p]:!my-0">
                    <Markdown content={variation.description} />
                  </div>
                )}
              </div>
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
          </section>
        );
      })}

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

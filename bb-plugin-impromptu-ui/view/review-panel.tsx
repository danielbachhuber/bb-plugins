// A visual review inside an opened item: the variations side by side, one
// per screen with the original first, each with a pick toggle and a note box,
// and one Send feedback button for all of it. With a single alternative there
// is nothing to pick between, so it shows as Before and After in one place
// instead, and asks whether to build it, or, for work already built, whether
// it looks good. Kept free of RPC so a story can
// render it with fixture images.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { approveLabel, feedbackLabel, hasFeedback, isBeforeAfter, type Feedback } from "./review.js";
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

const zoomButtonClass =
  "h-7 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-state-active hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

const zoomSteps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1];

/**
 * A screenshot at full size, with the other versions a tab or an arrow key
 * away. Every image sits in the same cell, so a flip is a cut in place and the
 * scroll position stays put, which makes what changed jump out.
 */
function Lightbox({
  versions,
  imageUrl,
  open,
  onOpenChange,
  onShow,
}: {
  versions: { name: string; label: string }[];
  imageUrl: (index: number) => string | null | undefined;
  /** The version showing, or null while closed. */
  open: number | null;
  onOpenChange: (open: number | null) => void;
  /** Called as the user flips, so the panel can follow. */
  onShow?: (index: number) => void;
}) {
  const count = versions.length;
  // Kept while the dialog closes and opens again, so the next screenshot opens at the same size.
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement | null>(null);
  const show = (index: number) => {
    const next = Math.max(0, Math.min(count - 1, index));
    onOpenChange(next);
    onShow?.(next);
  };
  const step = (direction: 1 | -1) =>
    setZoom((current) =>
      direction > 0
        ? (zoomSteps.find((value) => value > current + 0.001) ?? current)
        : ([...zoomSteps].reverse().find((value) => value < current - 0.001) ?? current),
    );
  // Read once, on click: the widest version's width against the space the dialog has.
  const fit = () => {
    const element = scroller.current;
    const widest = Math.max(0, ...Array.from(element?.querySelectorAll("img") ?? []).map((image) => image.naturalWidth));
    if (element && widest > 0) setZoom(Math.min(1, element.clientWidth / widest));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    // The dialog is portaled, but React still bubbles its keys to the panel underneath.
    if (event.key === "-" || event.key === "=" || event.key === "+" || event.key === "0") {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "0") setZoom(1);
      else step(event.key === "-" ? -1 : 1);
      return;
    }
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    event.stopPropagation();
    if (open !== null) show(open + (event.key === "ArrowRight" ? 1 : -1));
  };
  const current = open === null ? undefined : versions[open];
  return (
    <Dialog open={open !== null} onOpenChange={(isOpen) => (isOpen ? null : onOpenChange(null))}>
      <DialogContent className="flex max-h-[92vh] w-[92vw] max-w-[92vw] flex-col gap-2 p-3" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 pr-8">
          <DialogTitle className="min-w-0 truncate text-sm">{current?.label}</DialogTitle>
          {count > 1 ? (
            <div role="tablist" aria-label="Versions" className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {versions.map((version, index) => (
                <button
                  key={`${index}:${version.name}`}
                  type="button"
                  role="tab"
                  aria-selected={open === index}
                  title={version.label}
                  className={cn(
                    // No focus ring: the dialog focuses the first tab on open, and a ring there reads as selected.
                    "rounded-md px-2.5 py-1 text-xs font-medium outline-none",
                    open === index ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => show(index)}
                >
                  {version.name}
                </button>
              ))}
            </div>
          ) : null}
          {count > 1 ? <span className="shrink-0 text-xs text-muted-foreground">← → to flip</span> : null}
          <div aria-label="Zoom" className={cn("flex shrink-0 items-center gap-0.5", count > 1 ? "" : "ml-auto")}>
            <button type="button" className={zoomButtonClass} disabled={zoom <= zoomSteps[0]! + 0.001} onClick={() => step(-1)} aria-label="Zoom out" title="Zoom out (−)">
              −
            </button>
            <button
              type="button"
              className="w-11 rounded-md py-1 text-center text-xs tabular-nums text-muted-foreground outline-none hover:text-foreground"
              onClick={() => setZoom(1)}
              title="Actual size (0)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className={zoomButtonClass} disabled={zoom >= 1} onClick={() => step(1)} aria-label="Zoom in" title="Zoom in (+)">
              +
            </button>
            <button type="button" className={zoomButtonClass} onClick={fit} title="Fit the width">
              Fit
            </button>
          </div>
        </div>
        <div ref={scroller} className="min-h-0 overflow-auto">
          <div className="grid" style={{ zoom }}>
            {versions.map((version, index) => (
              <div key={`${index}:${version.name}`} className={cn("[grid-area:1/1]", open === index ? "visible" : "invisible")} aria-hidden={open !== index}>
                {open === null ? null : <img src={imageUrl(index) ?? undefined} alt={version.label} className="max-w-none" />}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

/**
 * The original and one proposed change, in the same place: a cut between the
 * two makes what changed jump out. The decision is whether to build it (or,
 * when it is already built, whether it looks good), with an optional note
 * either way.
 */
function BeforeAfterPanel({ item, record, imageUrl, busy, onSubmit, initial }: ReviewPanelProps) {
  const sent = record?.state === "done" ? record.result?.feedback : undefined;
  const start = sent ?? record?.result?.feedback ?? initial;
  const [showing, setShowing] = useState<0 | 1>(1);
  const [note, setNote] = useState(start?.overall ?? "");
  const [zoomed, setZoomed] = useState<number | null>(null);
  const locked = sent !== undefined || record?.state === "dismissed";
  const send = (pick: number | null) => onSubmit({ pick, notes: ["", ""], overall: note });
  const sides = [
    { name: "Before", variation: item.variations[0]! },
    { name: "After", variation: item.variations[1]! },
  ] as const;

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setShowing(event.key === "ArrowRight" ? 1 : 0);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Before and after" className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {sides.map((side, index) => (
            <button
              key={side.name}
              type="button"
              role="tab"
              aria-selected={showing === index}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                showing === index ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setShowing(index as 0 | 1)}
            >
              {side.name}
            </button>
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">← → to flip</span>
      </div>

      {/* Both images in one cell, so each starts in the same place and the cell keeps the taller one's height. */}
      <div tabIndex={0} aria-label="Before and after images" className="grid outline-none">
        {sides.map((side, index) => (
          <div key={side.name} className={cn("[grid-area:1/1]", showing === index ? "visible" : "invisible")} aria-hidden={showing !== index}>
            <VariationImage url={imageUrl(index)} label={`${side.name}: ${side.variation.label}`} onZoom={() => setZoomed(index)} />
          </div>
        ))}
      </div>
      {sides[showing].variation.description === "" ? null : (
        <div className="-mt-1 text-xs text-muted-foreground [&_*]:!text-xs [&_p]:!my-0">
          <Markdown content={sides[showing].variation.description} />
        </div>
      )}

      {locked && note.trim() === "" ? null : (
        <textarea
          aria-label="Note"
          placeholder={item.built ? "Note (optional): what to change" : "Note (optional): what to change before building it"}
          className={noteClass}
          rows={2}
          value={note}
          disabled={locked || busy}
          onChange={(event) => setNote(event.target.value)}
        />
      )}
      {locked ? (
        sent === undefined ? null : <div className="text-xs text-muted-foreground">Sent: {feedbackLabel(item, sent)}</div>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => send(1)}>
            {busy ? "Sending…" : approveLabel(item)}
          </Button>
          <Button size="sm" variant="outline" disabled={busy || note.trim() === ""} onClick={() => send(null)}>
            {item.built ? "Send note" : "Send note only"}
          </Button>
        </div>
      )}

      <Lightbox
        versions={sides.map((side) => ({ name: side.name, label: side.name }))}
        imageUrl={imageUrl}
        open={zoomed}
        onOpenChange={setZoomed}
        onShow={(index) => setShowing(index as 0 | 1)}
      />
    </div>
  );
}

export function ReviewPanel(props: ReviewPanelProps) {
  return isBeforeAfter(props.item) ? <BeforeAfterPanel {...props} /> : <VariationsPanel {...props} />;
}

function VariationsPanel({ item, record, imageUrl, busy, onSubmit, initial }: ReviewPanelProps) {
  const sent = record?.state === "done" ? record.result?.feedback : undefined;
  const start = sent ?? record?.result?.feedback ?? initial;
  const [pick, setPick] = useState<number | null>(start?.pick ?? null);
  const [notes, setNotes] = useState<string[]>(item.variations.map((_, index) => start?.notes[index] ?? ""));
  const [overall, setOverall] = useState(start?.overall ?? "");
  const [zoomed, setZoomed] = useState<number | null>(null);
  const [active, setActive] = useState(start?.pick ?? 0);
  const track = useRef<HTMLDivElement | null>(null);
  // A review reopened with a pick starts on that variation, so the track has to start there too.
  useLayoutEffect(() => {
    const element = track.current;
    if (element && active > 0) element.scrollTo({ left: active * element.clientWidth, behavior: "instant" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);
  const locked = sent !== undefined || record?.state === "dismissed";
  const feedback: Feedback = { pick, notes, overall };
  const labels = filmstripLabels(item.variations.map((variation) => variation.label));
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
        // Pinned to the panel's bottom edge: a tall image would otherwise push it out of view.
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-border bg-card px-4 py-2">
          <Button size="sm" disabled={busy || !hasFeedback(feedback)} onClick={() => onSubmit(feedback)}>
            {busy ? "Sending…" : "Send feedback"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {pick === null ? "Nothing picked" : `Picked: ${item.variations[pick]?.label}`}
          </span>
        </div>
      )}

      <Lightbox
        versions={item.variations.map((variation, index) => ({ name: labels[index]!, label: variation.label }))}
        imageUrl={imageUrl}
        open={zoomed}
        onOpenChange={setZoomed}
        onShow={show}
      />
    </div>
  );
}

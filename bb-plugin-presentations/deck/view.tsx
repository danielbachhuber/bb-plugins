// What a deck looks like. Display components only: they take a loaded deck
// and callbacks, and never call the server, so stories can render them.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Markdown,
  experimental_FileLink as FileLink,
  type ExperimentalLiveFileTarget,
} from "@get-bb/plugin-sdk/app";
import type { Deck, FileRoot } from "../server";
import { rewriteSlideImages } from "./images";
import { applyMove, keyToMove } from "./keys";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** The canvas every slide is laid out on, before scaling to the window. */
export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

/**
 * Slide typography. bb's `Markdown` is sized for chat, so the slide scales
 * it up on a fixed canvas: what fits in the panel fits on the projector.
 */
const SLIDE_CSS = `
.bbp-slide { font-size: 32px; line-height: 1.45; }
.bbp-slide :where(*) { font-size: inherit !important; line-height: inherit !important; }
.bbp-slide h1 { font-size: 76px !important; line-height: 1.1 !important; font-weight: 700; margin: 0 0 0.35em !important; letter-spacing: -0.02em; }
.bbp-slide h2 { font-size: 56px !important; line-height: 1.15 !important; font-weight: 650; margin: 0 0 0.4em !important; letter-spacing: -0.01em; }
.bbp-slide h3 { font-size: 40px !important; line-height: 1.2 !important; font-weight: 600; margin: 0 0 0.4em !important; }
.bbp-slide :is(ul, ol) { margin: 0.3em 0 !important; padding-left: 1.2em !important; }
.bbp-slide li + li { margin-top: 0.3em; }
.bbp-slide :is(code, pre) { font-size: 0.8em !important; }
.bbp-slide img { max-width: 100%; max-height: 460px; object-fit: contain; border-radius: 12px; }
`;

/** The slide, drawn on the fixed canvas at full size. */
export function SlideContent({ content }: { content: string }) {
  return (
    <div
      className="bbp-slide flex h-full w-full flex-col justify-center overflow-hidden bg-background p-[72px] text-foreground"
      style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}
    >
      <style>{SLIDE_CSS}</style>
      <Markdown content={content} />
    </div>
  );
}

/**
 * The stage: the slide canvas scaled to fit, centered on a dark backdrop.
 * Clicking the right half moves forward and the left half moves back.
 *
 * The scale is read in a ResizeObserver callback. The observed element's size
 * comes from its parent, not from the canvas, so changing the scale never
 * triggers another observation.
 */
export function SlideStage({
  content,
  onMove,
  stageRef,
  autoFocus = false,
  children,
}: {
  content: string | null;
  onMove: (move: "next" | "previous" | "first" | "last") => void;
  stageRef?: RefObject<HTMLDivElement | null>;
  autoFocus?: boolean;
  children?: ReactNode;
}) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const ref = stageRef ?? ownRef;
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus, ref]);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="region"
      aria-label="Slide"
      aria-roledescription="slide stage"
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-950 outline-none"
      onKeyDown={(event) => {
        const move = keyToMove(event.key);
        if (move === null) return;
        event.preventDefault();
        onMove(move);
      }}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onMove(event.clientX - box.left > box.width / 2 ? "next" : "previous");
      }}
    >
      {content !== null && scale > 0 ? (
        <div
          className="overflow-hidden shadow-2xl"
          style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <SlideContent content={content} />
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Where a slide file lives, for bb's file link. */
export function slideFileTarget(root: FileRoot, file: string): ExperimentalLiveFileTarget {
  const path = `${root.dir.replace(/\/+$/, "")}/${file}`;
  return root.kind === "workspace"
    ? { kind: "workspace", environmentId: root.environmentId, path }
    : { kind: "host", hostId: root.hostId, path };
}

/** A deck's slides with their images pointed at the asset route. */
export function useRenderedSlides(deck: Deck | null, imageUrl: (file: string) => string) {
  return useMemo(
    () => deck?.slides.map((slide) => rewriteSlideImages(slide.content, imageUrl)) ?? [],
    [deck, imageUrl],
  );
}

function Counter({ index, count }: { index: number; count: number }) {
  return (
    <span className="tabular-nums text-xs text-muted-foreground" aria-live="polite">
      {count === 0 ? "0 / 0" : `${index + 1} / ${count}`}
    </span>
  );
}

/** The message shown in place of a slide when there is none to show. */
function StageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-neutral-300">
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

function stageMessage(deck: Deck | null, error: string | null): ReactNode {
  if (error !== null) return <p>{error}</p>;
  if (deck === null) return <p>Loading slides…</p>;
  if (deck.problem !== null) {
    return (
      <>
        <p>Could not read the deck folder.</p>
        <p className="mt-1 font-mono text-xs text-neutral-400">{deck.path}</p>
        <p className="mt-2 text-xs text-neutral-400">{deck.problem}</p>
      </>
    );
  }
  if (deck.slides.length === 0) {
    return (
      <>
        <p>No slides yet.</p>
        <p className="mt-2 text-xs text-neutral-400">
          Add markdown files named like <code>01-title.md</code> to{" "}
          <code className="font-mono">{deck.path}</code>.
        </p>
      </>
    );
  }
  return null;
}

export interface DeckViewProps {
  deck: Deck | null;
  error: string | null;
  index: number;
  onIndexChange: (index: number) => void;
  imageUrl: (file: string) => string;
}

/**
 * The deck in a thread's side panel: a toolbar, the list of slide files, and
 * the stage. Full screen puts the stage alone on the screen; New window opens
 * the deck by itself in a browser window.
 */
export function DeckPanelView({
  deck,
  error,
  index,
  onIndexChange,
  imageUrl,
  onOpenWindow,
}: DeckViewProps & { onOpenWindow: () => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const slides = useRenderedSlides(deck, imageUrl);
  const count = slides.length;
  const message = stageMessage(deck, error);
  const move = (direction: "next" | "previous" | "first" | "last") =>
    onIndexChange(applyMove(index, count, direction));

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium" title={deck?.path}>
          {deck?.name ?? "Presentation"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Previous slide"
          disabled={index === 0}
          onClick={() => move("previous")}
        >
          <Icon name="ChevronLeft" className="size-4" />
        </Button>
        <Counter index={index} count={count} />
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Next slide"
          disabled={index >= count - 1}
          onClick={() => move("next")}
        >
          <Icon name="ChevronRight" className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          disabled={count === 0}
          onClick={() => {
            void stageRef.current?.requestFullscreen?.();
            stageRef.current?.focus({ preventScroll: true });
          }}
        >
          <Icon name="Maximize2" className="size-4" />
          Full screen
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onOpenWindow}>
          <Icon name="AppWindow" className="size-4" />
          New window
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col-reverse @[560px]:flex-row">
        <SlideList deck={deck} index={index} onIndexChange={onIndexChange} />
        <SlideStage
          content={message === null ? (slides[index] ?? null) : null}
          onMove={move}
          stageRef={stageRef}
          autoFocus
        >
          {message === null ? null : <StageMessage>{message}</StageMessage>}
        </SlideStage>
      </div>
    </div>
  );
}

/**
 * Every slide file, in order. The row jumps to the slide; the pencil opens
 * the file in a tab, where Markdown Editor edits it.
 */
export function SlideList({
  deck,
  index,
  onIndexChange,
}: {
  deck: Deck | null;
  index: number;
  onIndexChange: (index: number) => void;
}) {
  if (deck === null || deck.slides.length === 0) return null;
  return (
    <nav
      aria-label="Slides"
      className="max-h-[40%] shrink-0 overflow-y-auto border-t border-border py-1 @[560px]:max-h-none @[560px]:w-52 @[560px]:border-r @[560px]:border-t-0"
    >
      <ol>
        {deck.slides.map((slide, position) => (
          <li
            key={slide.file}
            className={cn(
              "group flex items-center gap-1 pr-1",
              position === index && "bg-accent",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-baseline gap-2 py-1.5 pl-3 text-left text-sm"
              aria-current={position === index ? "true" : undefined}
              onClick={() => onIndexChange(position)}
            >
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {position + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{slide.title}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {slide.file}
                </span>
              </span>
            </button>
            <FileLink
              target={slideFileTarget(deck.fileRoot, slide.file)}
              aria-label={`Edit ${slide.file}`}
              title={`Edit ${slide.file}`}
              className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Icon name="Edit" className="size-3.5" />
            </FileLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The deck alone, for the window the panel's New window button opens. The
 * whole page is the stage, so the arrow keys work without focusing anything.
 */
export function DeckWindowView({ deck, error, index, onIndexChange, imageUrl }: DeckViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const slides = useRenderedSlides(deck, imageUrl);
  const count = slides.length;
  const message = stageMessage(deck, error);
  const move = (direction: "next" | "previous" | "first" | "last") =>
    onIndexChange(applyMove(index, count, direction));

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950">
      <SlideStage
        content={message === null ? (slides[index] ?? null) : null}
        onMove={move}
        stageRef={stageRef}
        autoFocus
      >
        {message === null ? null : <StageMessage>{message}</StageMessage>}
      </SlideStage>
      <div className="flex h-10 shrink-0 items-center gap-2 px-3 text-neutral-300">
        <span className="min-w-0 flex-1 truncate text-sm">{deck?.name ?? "Presentation"}</span>
        <Counter index={index} count={count} />
        <Button
          size="sm"
          className="h-7"
          disabled={count === 0}
          onClick={() => {
            void stageRef.current?.requestFullscreen?.();
            stageRef.current?.focus({ preventScroll: true });
          }}
        >
          <Icon name="Play" className="size-4" />
          Present
        </Button>
      </div>
    </div>
  );
}

// The evidence behind an item's proposed text: a numbered mark on each claim,
// and a card of footnotes with the quotes that back each one and where each
// is from. Kept free of RPC so a story can render it with fixture props.
import { Fragment, type ReactNode } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { SUPPORT_LABEL, placeClaims, supportCounts, type ClaimSpan } from "./evidence.js";
import type { Evidence } from "./schema.js";

const SUPPORT_CLASS: Record<Evidence["support"], { text: string; marker: string; underline: string }> = {
  full: { text: "text-success", marker: "border-success/50 bg-success/10 text-success", underline: "decoration-success/70" },
  partial: { text: "text-warning", marker: "border-warning/60 bg-warning/10 text-warning", underline: "decoration-warning" },
  none: { text: "text-destructive", marker: "border-destructive/50 bg-destructive/10 text-destructive", underline: "decoration-destructive" },
};

export function Marker({ number, support }: { number: number; support: Evidence["support"] }) {
  return (
    <sup
      aria-label={`Evidence ${number}: ${SUPPORT_LABEL[support]}`}
      className={cn(
        "ml-0.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full border px-1 text-[9.5px] font-semibold leading-none",
        SUPPORT_CLASS[support].marker,
      )}
    >
      {number}
    </sup>
  );
}

/** "3 supported · 1 partly · 1 unsupported". */
export function SupportSummary({ evidence }: { evidence: Evidence[] }) {
  const counts = supportCounts(evidence);
  const parts = [
    counts.full > 0 ? <span className="text-success">{counts.full} supported</span> : null,
    counts.partial > 0 ? <span className="text-warning">{counts.partial} partly</span> : null,
    counts.none > 0 ? <span className="text-destructive">{counts.none} unsupported</span> : null,
  ].filter((part) => part !== null);
  return (
    <span className="shrink-0">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? " · " : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

export interface Piece {
  text: string;
  className?: string;
  /** False for words shown struck out: they are not in the proposed text. */
  inText: boolean;
}

/** A line's pieces with each claim underlined in its support's color and its marker after it. */
export function markClaims(pieces: Piece[], spans: ClaimSpan[]): ReactNode[] {
  const out: ReactNode[] = [];
  let offset = 0;
  pieces.forEach((piece, p) => {
    if (!piece.inText) {
      out.push(
        <span key={p} className={piece.className}>
          {piece.text}
        </span>,
      );
      return;
    }
    const start = offset;
    const end = offset + piece.text.length;
    const cuts = new Set([start, end]);
    for (const span of spans) {
      if (span.start > start && span.start < end) cuts.add(span.start);
      if (span.end > start && span.end < end) cuts.add(span.end);
    }
    const bounds = [...cuts].sort((a, b) => a - b);
    for (let b = 0; b < bounds.length - 1; b++) {
      const from = bounds[b]!;
      const to = bounds[b + 1]!;
      const span = spans.find((s) => s.start <= from && to <= s.end);
      out.push(
        <span
          key={`${p}:${from}`}
          className={cn(
            piece.className,
            span && "underline decoration-dotted decoration-[1.5px] underline-offset-[3px]",
            span && SUPPORT_CLASS[span.evidence.support].underline,
          )}
        >
          {piece.text.slice(from - start, to - start)}
        </span>,
      );
      const ending = spans.find((s) => s.end === to);
      if (ending) out.push(<Marker key={`m${ending.number}`} number={ending.number} support={ending.evidence.support} />);
    }
    offset = end;
  });
  return out;
}

function Entry({ number, evidence }: { number: number; evidence: Evidence }) {
  return (
    <div className="flex flex-col gap-1.5 text-[12px] leading-snug">
      <div className="flex items-baseline gap-1.5">
        <Marker number={number} support={evidence.support} />
        <span className={cn("shrink-0 font-medium", SUPPORT_CLASS[evidence.support].text)}>{SUPPORT_LABEL[evidence.support]}</span>
        <span className="min-w-0 text-muted-foreground">“{evidence.claim}”</span>
      </div>
      {evidence.note === undefined ? null : (
        <div className="flex gap-1.5 rounded-sm bg-warning/10 px-2 py-1 text-foreground">
          <span className="text-warning">⚠</span>
          <span>{evidence.note}</span>
        </div>
      )}
      {evidence.sources.map((source, i) => (
        <div key={i} className="border-l-2 border-border pl-2">
          <div className="text-foreground/90">“{source.quote}”</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {source.url === undefined ? (
              source.source
            ) : (
              <UrlLink href={source.url} className="hover:underline">
                {source.source} ↗
              </UrlLink>
            )}
          </div>
        </div>
      ))}
      {evidence.sources.length === 0 ? <div className="text-muted-foreground">No source found.</div> : null}
    </div>
  );
}

/**
 * Every claim's evidence, in the order of its markers, then the claims no
 * longer in the text, so an edit does not lose their quotes.
 */
export function EvidenceCard({ text, evidence }: { text: string; evidence: Evidence[] }) {
  const { present, missing } = placeClaims(text, evidence);
  return (
    <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-sm font-medium text-foreground">Evidence</span>
        <SupportSummary evidence={evidence} />
      </div>
      <div className="flex flex-col gap-3">
        {present.map(({ evidence: entry, number }) => (
          <Entry key={entry.id} number={number} evidence={entry} />
        ))}
      </div>
      {missing.length === 0 ? null : (
        <div className={cn("flex flex-col gap-2", present.length > 0 && "mt-3 border-t border-border pt-2.5")}>
          <div className="text-[11px] font-medium text-muted-foreground">No longer in the text</div>
          {missing.map(({ evidence: entry, number }) => (
            <div key={entry.id} className="opacity-70">
              <Entry number={number} evidence={entry} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

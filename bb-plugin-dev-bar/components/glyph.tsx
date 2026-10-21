import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * Small icons drawn inline. bb's icon set has no play, stop, restart,
 * database, or external-link icon, and an unknown name draws a fallback.
 */
const PATHS = {
  play: <path d="M4.5 3l8.5 5-8.5 5z" fill="currentColor" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />,
  restart: (
    <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v2.5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  database: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="8" cy="4" rx="5" ry="2" />
      <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </g>
  ),
  external: (
    <path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
} satisfies Record<string, ReactNode>;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-3 shrink-0", className)} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** A glyph for a repository's button, guessed from its label, or null when nothing fits. */
export function glyphForLabel(label: string): GlyphName | null {
  const words = label.toLowerCase();
  if (/\b(reset|seed|database|db|migrate)\b/.test(words)) return "database";
  if (/\b(sync|restart|reload|refresh)\b/.test(words)) return "restart";
  if (/\b(stop|kill|down)\b/.test(words)) return "stop";
  if (/\b(start|launch|run|up)\b/.test(words)) return "play";
  return null;
}

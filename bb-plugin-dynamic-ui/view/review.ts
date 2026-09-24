/**
 * Visual review: an item whose variations are images of one piece of UI, the
 * original first. The user picks one, notes on any, and sends it back to the
 * thread as a single message. Pure, so the message can be tested alone.
 */
import type { Item } from "./schema.js";

/** Largest image `publish` will keep, per variation. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** The image type for a path, or null for a file the panel cannot show. */
export function imageMime(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

export interface Feedback {
  /** Index of the variation to build, or null for none. */
  pick: number | null;
  /** One note per variation, in order; empty for none. */
  notes: string[];
  overall: string;
}

export function hasFeedback(feedback: Feedback): boolean {
  return feedback.pick !== null || feedback.overall.trim() !== "" || feedback.notes.some((note) => note.trim() !== "");
}

/** The message the thread receives, written so it reads without the panel. */
export function feedbackMessage(item: Item, feedback: Feedback): string {
  const lines = [`Visual review feedback on "${item.title}":`, ""];
  const picked = feedback.pick === null ? undefined : item.variations[feedback.pick];
  lines.push(picked === undefined ? "Pick: none of them yet." : `Pick: **${picked.label}**`);
  const notes = item.variations.flatMap((variation, index) => {
    const note = feedback.notes[index]?.trim() ?? "";
    return note === "" ? [] : [`- ${variation.label}: ${note.replace(/\s*\n\s*/g, " ")}`];
  });
  if (notes.length > 0) lines.push("", ...notes);
  if (feedback.overall.trim() !== "") lines.push("", `Overall: ${feedback.overall.trim()}`);
  return lines.join("\n");
}

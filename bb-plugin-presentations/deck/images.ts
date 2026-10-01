// Pointing a slide's images at the plugin's own route.
//
// bb's `Markdown` keeps an <img> only when its src is an absolute http or
// https URL; a relative path resolves against the app's origin and a data URL
// is dropped. So every relative image reference is rewritten to the asset
// route, which reads the bytes from the deck folder.
//
// The reference parser is copied from bb-plugin-markdown-editor's
// editor/images.ts, which documents the edge cases it covers.

import { resolveInDeck } from "./slides";

interface ImageRef {
  url: string;
  start: number;
  end: number;
}

const FENCE = /^ {0,3}(?:```|~~~)/;

/** Every image reference outside fenced code and inline code spans. */
export function findImageRefs(markdown: string): ImageRef[] {
  const refs: ImageRef[] = [];
  let index = 0;
  let atLineStart = true;
  let inFence = false;

  while (index < markdown.length) {
    if (atLineStart) {
      const lineEnd = markdown.indexOf("\n", index);
      const line = markdown.slice(index, lineEnd < 0 ? undefined : lineEnd);
      if (FENCE.test(line)) {
        inFence = !inFence;
        index = lineEnd < 0 ? markdown.length : lineEnd + 1;
        continue;
      }
      if (inFence) {
        index = lineEnd < 0 ? markdown.length : lineEnd + 1;
        continue;
      }
    }

    const char = markdown[index];
    atLineStart = char === "\n";

    if (char === "`") {
      let run = 0;
      while (markdown[index + run] === "`") run += 1;
      const closing = markdown.indexOf("`".repeat(run), index + run);
      index = closing < 0 ? index + run : closing + run;
      continue;
    }

    if (char === "!" && markdown[index + 1] === "[") {
      const parsed = parseImageAt(markdown, index);
      if (parsed !== null) {
        refs.push(parsed.ref);
        index = parsed.nextIndex;
        continue;
      }
    }

    index += 1;
  }

  return refs;
}

function parseImageAt(
  markdown: string,
  start: number,
): { ref: ImageRef; nextIndex: number } | null {
  let index = start + 2;
  let depth = 1;
  while (index < markdown.length && depth > 0) {
    const char = markdown[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;
    index += 1;
  }
  if (depth !== 0 || markdown[index] !== "(") return null;
  index += 1;

  if (markdown[index] === "<") {
    const close = markdown.indexOf(">", index + 1);
    if (close < 0) return null;
    const urlStart = index + 1;
    const rest = markdown.indexOf(")", close);
    if (rest < 0) return null;
    return {
      ref: { url: markdown.slice(urlStart, close), start: urlStart, end: close },
      nextIndex: rest + 1,
    };
  }

  const urlStart = index;
  let parens = 1;
  while (index < markdown.length) {
    const char = markdown[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "(") parens += 1;
    else if (char === ")") {
      parens -= 1;
      if (parens === 0) break;
    } else if (char === " " || char === "\t" || char === "\n") break;
    index += 1;
  }
  if (index >= markdown.length) return null;
  const urlEnd = index;
  while (index < markdown.length && parens > 0) {
    const char = markdown[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "(") parens += 1;
    else if (char === ")") parens -= 1;
    index += 1;
  }
  if (urlEnd === urlStart) return null;
  return {
    ref: { url: markdown.slice(urlStart, urlEnd), start: urlStart, end: urlEnd },
    nextIndex: index,
  };
}

/** True for a reference with no scheme and no leading slash. */
function isRelativeRef(url: string): boolean {
  if (url === "" || url.startsWith("/") || url.startsWith("#")) return false;
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !url.startsWith("//");
}

function decodeRef(url: string): string {
  return url
    .split("/")
    .map((segment) => {
      try {
        const decoded = decodeURIComponent(segment);
        return decoded.includes("/") ? segment : decoded;
      } catch {
        return segment;
      }
    })
    .join("/");
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  apng: "image/apng",
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/** The media type for a path, or null when it is not an image. */
export function imageMimeType(path: string): string | null {
  const name = path.split("/").at(-1) ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return MIME_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Rewrite each relative image in a slide to the URL `toUrl` builds for its
 * path inside the deck. A reference that leaves the deck folder or is not an
 * image is left as written.
 */
export function rewriteSlideImages(
  markdown: string,
  toUrl: (deckRelativePath: string) => string,
): string {
  let result = markdown;
  const refs = findImageRefs(markdown).sort((a, b) => b.start - a.start);
  for (const ref of refs) {
    if (!isRelativeRef(ref.url)) continue;
    const path = resolveInDeck(decodeRef(ref.url));
    if (path === null || imageMimeType(path) === null) continue;
    result = result.slice(0, ref.start) + toUrl(path) + result.slice(ref.end);
  }
  return result;
}

// Finding the images a markdown file points at, and working out where they
// live.
//
// bb's `Markdown` component takes a string and nothing else. It has no idea
// which file the string came from, so `![](screenshots/raw.png)` resolves
// against the app's origin and comes back as the SPA's index.html — an <img>
// holding HTML, which the browser draws as a broken icon. The fix is to
// resolve each relative reference ourselves and hand the renderer a data URL.
//
// A data URL would have been the obvious answer and does not work: bb's
// sanitizer keeps an <img> only when its src is an absolute http or https URL,
// and drops the element entirely otherwise. So the rewrite points each
// reference at the plugin's own HTTP route, which serves the bytes from the
// host the file lives on.
//
// Everything here is pure text work: which references exist, where they point,
// and what the rewritten document looks like. Reading the bytes is the
// server's job.

/** One image reference, with the span its URL occupies in the source. */
export interface ImageRef {
  /** The URL exactly as written, before any unescaping. */
  url: string;
  /** Index of the first character of the URL in the source string. */
  start: number;
  /** Index one past the last character of the URL. */
  end: number;
}

const FENCE = /^ {0,3}(?:```|~~~)/;

/**
 * Collect every image reference outside code.
 *
 * A README that documents markdown is full of `![alt](path)` inside fenced
 * blocks and inline code, and rewriting those would corrupt the very thing
 * the author is showing. So fences and backtick spans are skipped rather
 * than parsed.
 */
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

    // An inline code span runs from a backtick run to the next run of the
    // same length, and nothing inside it is markup.
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

/** Parse `![alt](url "title")` starting at `!`, or return null if it is not one. */
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

  // `<...>` wraps a URL containing spaces. The angle brackets are delimiters,
  // not part of the URL, so the span we report excludes them.
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
  // Skip a title, if there is one, to find the closing paren.
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
  return { ref: { url: markdown.slice(urlStart, urlEnd), start: urlStart, end: urlEnd }, nextIndex: index };
}

/**
 * True for a reference this plugin should resolve against the open file.
 *
 * A URL with a scheme already works, and so does a data URL. A root-relative
 * `/logo.png` is deliberately left alone: on GitHub it means the repository
 * root, which is not a thing a host file even has, and guessing wrong would
 * point at the wrong image rather than showing an honest broken one.
 */
export function isSiblingRef(url: string): boolean {
  if (url === "") return false;
  if (url.startsWith("/") || url.startsWith("#")) return false;
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !url.startsWith("//");
}

/**
 * Resolve a reference against the markdown file's own directory.
 *
 * Returns null when the result climbs above the top of a relative path, which
 * for a workspace or thread-storage file means out of its root. An absolute
 * file path keeps its leading slash and can walk anywhere its host allows,
 * which is the same reach the file itself has.
 */
export function resolveSibling(filePath: string, ref: string): string | null {
  const absolute = filePath.startsWith("/");
  const directory = filePath.split("/").slice(0, -1);
  const resolved: string[] = [];

  for (const segment of [...directory, ...ref.split("/")]) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // Nothing left to pop means the reference climbs above its root,
      // or above / for an absolute path. Neither is a place to read from.
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  if (resolved.length === 0) return null;
  return `${absolute ? "/" : ""}${resolved.join("/")}`;
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

/** The media type for a path, or null when it is not an image we inline. */
export function imageMimeType(path: string): string | null {
  const name = path.split("/").at(-1) ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return MIME_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Rewrite the URLs of the given references.
 *
 * Applied back to front so an earlier replacement cannot shift the spans of
 * the ones after it. A reference with no entry in `replacements` is left
 * exactly as the author wrote it.
 */
export function replaceImageUrls(
  markdown: string,
  refs: readonly ImageRef[],
  replacements: ReadonlyMap<string, string>,
): string {
  let result = markdown;
  for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
    const next = replacements.get(ref.url);
    if (next === undefined) continue;
    result = result.slice(0, ref.start) + next + result.slice(ref.end);
  }
  return result;
}

/** The parts of a file's origin the asset route needs in its query string. */
export interface AssetSource {
  kind: string;
  threadId: string | null;
  environmentId: string | null;
  projectId: string | null;
  hostId?: string;
}

/**
 * The URL that serves one image through the plugin's HTTP route.
 *
 * Absolute, because a relative src is what the sanitizer drops. The origin
 * comes from the page rather than from the server's own loopback address, so
 * this still resolves when bb is open from another machine.
 */
export function buildAssetUrl(
  origin: string,
  routePath: string,
  path: string,
  source: AssetSource,
): string {
  const query = new URLSearchParams({ path, kind: source.kind });
  if (source.threadId !== null) query.set("threadId", source.threadId);
  if (source.environmentId !== null) query.set("environmentId", source.environmentId);
  if (source.projectId !== null) query.set("projectId", source.projectId);
  if (source.hostId !== undefined) query.set("hostId", source.hostId);
  return `${origin.replace(/\/+$/, "")}${routePath}?${query.toString()}`;
}

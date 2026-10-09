// Copying a link to the clipboard, in both flavours, so the paste target
// picks. No React here: a plugin draws its own button around it.

/**
 * Escapes text for an HTML attribute or text node.
 *
 * Not optional. Real titles carry angle brackets, and pasting one raw into a
 * document would swallow everything between them.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `<a href="…">title</a>`, which is what a document or a chat window wants. */
export function linkHtml(title: string, url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`;
}

/**
 * The plain-text flavour, for editors and terminals that take no HTML.
 *
 * Markdown rather than "title (url)": the places a plain-text paste lands from
 * here are GitHub comments, commit messages and editors, all of which render
 * it as the same link the HTML flavour produces.
 */
export function linkMarkdown(title: string, url: string): string {
  return `[${title}](${url})`;
}

/**
 * Writes both flavours in one clipboard entry.
 *
 * Falls back to plain text where the rich write is unavailable, such as a
 * browser without `ClipboardItem`. Copying something beats copying nothing,
 * and the caller cannot tell the difference.
 */
export async function writeLinkToClipboard(title: string, url: string): Promise<boolean> {
  const html = linkHtml(title, url);
  const text = linkMarkdown(title, url);

  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// What Show more puts in place of a plain email's snippet: its latest
// message as plain text. Runs in the page, where DOMParser reads the HTML.
import type { EmailThread } from "./contract.js";

/** Elements that end a line of text where they close. */
const BLOCKS = new Set(["P", "DIV", "BR", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TABLE", "UL", "OL", "HR"]);

/** The words of an HTML body, a line per block, without its styles, scripts, or hidden previews. */
export function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, head, title, [hidden], [style*='display:none'], [style*='display: none']").forEach((node) => node.remove());
  let text = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? "").replace(/\s+/g, " ");
      return;
    }
    if (!(node instanceof Element)) return;
    node.childNodes.forEach(visit);
    if (BLOCKS.has(node.tagName)) text += "\n";
  };
  if (doc.body !== null) visit(doc.body);
  return text;
}

/**
 * A message's text tidied for a row: each line trimmed, runs of blank lines
 * cut to one, and the earlier messages a reply quotes beneath it taken off.
 */
export function tidyEmailText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t ]+/g, " ").trim());
  const quoted = lines.findIndex(
    (line, index) =>
      /^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}$/i.test(line) ||
      (/^On .+/.test(line) && /wrote:$/.test(line) && index > 0) ||
      (/^>/.test(line) && lines.slice(index).every((rest) => rest === "" || rest.startsWith(">"))),
  );
  return (quoted < 0 ? lines : lines.slice(0, quoted))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The latest message's text, from its plain-text part or else its HTML. Empty when it has neither. */
export function latestMessageText(thread: EmailThread): string {
  const latest = thread.messages[thread.messages.length - 1];
  if (latest === undefined) return "";
  const text = latest.text?.trim() ? latest.text : latest.html === null ? "" : htmlText(latest.html);
  return tidyEmailText(text);
}

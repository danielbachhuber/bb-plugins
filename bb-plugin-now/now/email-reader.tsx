// The Email tab: one row's email in full, beside the list. Draws only.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import type { EmailMessage, EmailThread } from "./contract.js";

function when(date: string | null): string {
  if (date === null) return "";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

/** The document the frame shows: the sender's HTML, or the plain text kept as written. */
export function frameDocument(message: Pick<EmailMessage, "html" | "text">): string {
  const body =
    message.html ??
    `<pre style="white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;margin:0">${escapeHtml(message.text ?? "")}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;color:#111;background:#fff;overflow:hidden}img{max-width:100%;height:auto}img[src^="cid:"]{display:none}</style></head><body>${body}</body></html>`;
}

/**
 * The message as its sender laid it out, in a frame that runs no scripts.
 * Links go to `onOpenLink` rather than navigating the frame, and the frame
 * grows to the message's height, so the tab has one scroll bar, not two.
 */
export function EmailBody({ message, onOpenLink }: { message: EmailMessage; onOpenLink?: (url: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const doc = frameDocument(message);

  useEffect(() => {
    const node = frame.current;
    if (node === null) return;
    let observer: ResizeObserver | null = null;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (link === null || !/^https?:/i.test(link.href) || onOpenLink === undefined) return;
      event.preventDefault();
      onOpenLink(link.href);
    };
    const onLoad = () => {
      const inner = node.contentDocument;
      if (!inner?.body) return;
      // The body, not the document, which is never shorter than the frame itself.
      const measure = () => setHeight(Math.ceil(inner.body.getBoundingClientRect().height));
      measure();
      // Images arrive after load, and each one can make the message taller.
      observer = new ResizeObserver(measure);
      observer.observe(inner.body);
      inner.addEventListener("click", onClick);
    };
    node.addEventListener("load", onLoad);
    return () => {
      node.removeEventListener("load", onLoad);
      observer?.disconnect();
      node.contentDocument?.removeEventListener("click", onClick);
    };
  }, [doc, onOpenLink]);

  return (
    <iframe
      ref={frame}
      title={`Email from ${message.from}`}
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="block w-full rounded-md border border-border bg-white"
      style={{ height }}
    />
  );
}

export interface EmailReaderProps {
  thread: EmailThread;
  /** Set while Archive runs, so the button says so. */
  archiving?: boolean;
  onArchive?: () => void;
  onStartThread?: () => void;
  onOpenLink?: (url: string) => void;
}

/**
 * The thread's subject, then its messages in order: the latest open, the
 * earlier ones one line each until clicked. Archive and Start thread stay
 * at the top however long the message is.
 */
export function EmailReader({ thread, archiving = false, onArchive, onStartThread, onOpenLink }: EmailReaderProps) {
  const latest = thread.messages[thread.messages.length - 1]?.id;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(latest === undefined ? [] : [latest]));
  useEffect(() => setOpen(new Set(latest === undefined ? [] : [latest])), [thread.threadId, latest]);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button variant="outline" size="sm" disabled={archiving} onClick={onArchive}>
          <Icon name={archiving ? "Loading" : "Archive"} className={cn("size-3.5", archiving && "animate-spin")} />
          {archiving ? "Archiving…" : "Archive"}
        </Button>
        <Button variant="outline" size="sm" disabled={archiving} onClick={onStartThread}>
          <Icon name="MessageSquarePlus" className="size-3.5" />
          Start thread
        </Button>
        <UrlLink href={thread.url} className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline">
          Open in Gmail
        </UrlLink>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h2 className="text-base font-semibold text-foreground">{thread.subject}</h2>
        <div className="mt-3 space-y-2">
          {thread.messages.map((message) => {
            const expanded = open.has(message.id);
            return (
              <div key={message.id} className={cn("rounded-md border border-border", !expanded && "bg-muted/40")}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
                  aria-expanded={expanded}
                  onClick={() => toggle(message.id)}
                >
                  <Icon name={expanded ? "ChevronDown" : "ChevronRight"} className="size-3 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 font-medium text-foreground" title={message.address ?? undefined}>
                    {message.from}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{expanded ? message.address : message.snippet}</span>
                  <span className="shrink-0 text-muted-foreground">{when(message.date)}</span>
                </button>
                {expanded ? (
                  <div className="px-3 pb-3">
                    <EmailBody message={message} onOpenLink={onOpenLink} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** What the tab says when it has no email to show, or is fetching one. */
export function EmailReaderNote({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {loading ? <Icon name="Loading" className="mr-2 size-4 animate-spin" /> : null}
      {children}
    </div>
  );
}

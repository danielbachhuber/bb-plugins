import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import type { EmailThread, Listing } from "./now/contract";
import { EmailReader, EmailReaderNote } from "./now/email-reader";
import { ItemListView } from "./now/item-list";
import { ReadingContext, type RowActions } from "./now/item-row";
import { mergeItems } from "./now/items";
import type { Item } from "./now/types";

export default {
  title: "now/Email reader",
};

const now = new Date(2026, 8, 24, 9, 30);
const noop = () => {};

function email(id: string, title: string, from: string, at: Date, snippet: string, unread = false, messages = 1): Item {
  return {
    id: `gmail:${id}`,
    source: "gmail",
    title,
    description: snippet,
    priority: null,
    due: null,
    deadline: null,
    activityAt: at.toISOString(),
    context: from,
    tags: [],
    url: `https://mail.google.com/mail/#all/${id}`,
    gmail: { threadIds: [id], unread, messages, unreadMessages: unread ? 1 : 0 },
    github: null,
  };
}

function task(id: string, title: string, overrides: Partial<Item> = {}): Item {
  return {
    id: `todoist:${id}`,
    source: "todoist",
    title,
    description: "",
    priority: null,
    due: null,
    deadline: null,
    activityAt: null,
    context: "Widgets",
    tags: [],
    url: `https://app.todoist.com/app/task/${id}`,
    gmail: null,
    github: null,
    todoist: { projectId: "widgets" },
    ...overrides,
  };
}

const newsletter = email(
  "news1",
  "This week at the widget lab: gadgets that fold",
  "Acme Widgets",
  new Date(2026, 8, 24, 6, 1),
  "View in browser. Hi there, this week we folded a gadget in half and it kept working. Here is what we learned, and what it means for the widgets you have on order.",
);
const swap = email(
  "swap1",
  "Saturday's gadget swap",
  "hubber",
  new Date(2026, 8, 23, 18, 12),
  "Works for me. I'll bring the spare gadget adapters and a box of widgets.",
  false,
  3,
);
const items = mergeItems([
  [newsletter, swap],
  [
    task("t1", "Reply to octocat about the widget launch date", { priority: 1, due: { date: "2026-09-24", recurring: false } }),
    task("t2", "Order more widget springs", { due: { date: "2026-09-26", recurring: false }, context: "Gadgets" }),
  ],
]);

const listing: Listing = {
  list: {
    items,
    sources: [
      { id: "todoist", name: "Todoist", state: "ok", query: "today | overdue | 7 days", count: 2 },
      { id: "gmail", name: "Gmail", state: "ok", query: "in:inbox", count: 2 },
    ],
    fetchedAt: new Date(now.getTime() - 4 * 60_000).toISOString(),
  },
  threads: {},
  threadProjectId: null,
  syncing: false,
};

const actions: RowActions = {
  onRsvp: noop,
  onMerge: noop,
  onArchive: noop,
  onMarkRead: noop,
  onComplete: noop,
  onReply: async () => true,
  onStartThread: noop,
  onOpenThread: noop,
  onEdit: async () => true,
  onDelete: noop,
  onPostpone: noop,
};

/** A banner drawn in place, so the story loads nothing from the network. */
const banner = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 160"><rect width="600" height="160" fill="#1f3a5f"/><text x="300" y="92" font-family="Georgia,serif" font-size="40" fill="#f4d58d" text-anchor="middle">The Widget Lab</text></svg>`,
)}`;

const newsletterHtml = `
<div style="max-width:600px;margin:0 auto;font-family:Georgia,serif;color:#222">
  <p style="font:12px sans-serif;color:#888;text-align:center">View in browser</p>
  <img src="${banner}" alt="The Widget Lab" style="width:100%;display:block">
  <h1 style="font-size:24px;margin:24px 0 8px">Gadgets that fold</h1>
  <p style="font-size:16px;line-height:1.6">Hi there,</p>
  <p style="font-size:16px;line-height:1.6">This week we folded a gadget in half and it kept working. Here is what we learned, and what it means for the widgets you have on order.</p>
  <h2 style="font-size:18px;margin:20px 0 6px">1. The hinge matters more than the frame</h2>
  <p style="font-size:16px;line-height:1.6">Every gadget that failed, failed at the hinge. The frames held up through two thousand folds.</p>
  <h2 style="font-size:18px;margin:20px 0 6px">2. Widgets ship on the 30th</h2>
  <p style="font-size:16px;line-height:1.6">If you ordered a widget before September, it leaves the lab next Tuesday. <a href="https://example.com/orders" style="color:#1f3a5f">Check your order</a>.</p>
  <p style="text-align:center;margin:28px 0"><a href="https://example.com/lab" style="background:#1f3a5f;color:#fff;padding:12px 22px;border-radius:4px;text-decoration:none;font:600 14px sans-serif">Read the full lab notes</a></p>
  <p style="font:12px sans-serif;color:#888;text-align:center">Acme Widgets · 1 Widget Way · Unsubscribe</p>
</div>`;

const newsletterThread: EmailThread = {
  threadId: "news1",
  subject: newsletter.title,
  url: newsletter.url,
  messages: [
    {
      id: "m1",
      from: "Acme Widgets",
      address: "lab@acme.example",
      date: newsletter.activityAt,
      snippet: "View in browser. Hi there, this week we folded a gadget in half and it kept working.",
      html: newsletterHtml,
      text: null,
    },
  ],
};

function message(id: string, from: string, at: Date, text: string) {
  const address = from === "Me" ? "me@acme.example" : `${from}@acme.example`;
  return { id, from, address, date: at.toISOString(), snippet: text.split("\n")[0]!, html: null, text };
}

const swapThread: EmailThread = {
  threadId: "swap1",
  subject: swap.title,
  url: swap.url,
  messages: [
    message("s1", "octocat", new Date(2026, 8, 23, 9, 4), "Is anyone around Saturday morning for a gadget swap? I have too many hinges."),
    message("s2", "Me", new Date(2026, 8, 23, 12, 30), "Yes, 10am at the lab?"),
    message("s3", "hubber", new Date(2026, 8, 23, 18, 12), "Works for me. I'll bring the spare gadget adapters and a box of widgets.\n\nSee you Saturday,\nhubber"),
  ],
};

/** bb's right-panel tab strip, drawn for context: the Email tab beside bb's own. */
function PanelTabs() {
  const tab = (label: string, icon: string, active = false) => (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
        active ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon name={icon} className="size-3.5" />
      {label}
    </span>
  );
  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
      {tab("Email", "Mail", true)}
      {tab("Browser", "Globe")}
      {tab("Terminal", "Terminal")}
    </div>
  );
}

function Page({ thread }: { thread: EmailThread | null }) {
  return (
    <div className="flex h-[760px] w-[1360px] overflow-hidden rounded-lg border border-border bg-background">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="border-b border-border px-4 py-2 text-sm font-medium text-foreground">Now</div>
        <ReadingContext.Provider value={thread === null ? null : `gmail:${thread.threadId}`}>
          <ItemListView listing={listing} now={now} actions={{ ...actions, onRead: noop }} />
        </ReadingContext.Provider>
      </div>
      <div className="flex w-[520px] shrink-0 flex-col border-l border-border">
        <PanelTabs />
        <div className="min-h-0 flex-1">
          {thread === null ? (
            <EmailReaderNote>Choose Read on an email to read it here.</EmailReaderNote>
          ) : (
            <EmailReader thread={thread} onArchive={noop} onStartThread={noop} onClose={noop} onOpenLink={noop} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Read on a newsletter opens it in the Email tab beside the list, laid out as
 * its sender wrote it, and marks it read. The row being read is highlighted.
 */
export const Newsletter = () => <Page thread={newsletterThread} />;

/**
 * A thread of several messages shows the latest open and the earlier ones one
 * line each, which open when clicked.
 */
export const Conversation = () => <Page thread={swapThread} />;

/** The Email tab before Read has opened anything in it. */
export const Empty = () => <Page thread={null} />;

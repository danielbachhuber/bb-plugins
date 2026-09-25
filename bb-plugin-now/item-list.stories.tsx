import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SyncStatus } from "./components/ui/sync-status";

import type { Listing, NowList, SourceStatus } from "./now/contract";
import { ItemListView, type Filter } from "./now/item-list";
import type { PendingAction } from "./now/item-row";
import { mergeItems } from "./now/items";
import type { Item } from "./now/types";

type LoadedSource = Extract<SourceStatus, { state: "ok" }>;

export default {
  title: "now/Item list",
};

/** Thursday morning, so the fixtures cover overdue, today, this week, and later. */
const now = new Date(2026, 8, 24, 9, 30);
const noop = () => {};

function email(id: string, title: string, from: string, at: Date, snippet: string, unread = false): Item {
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
    gmail: { threadIds: [id], unread },
    github: null,
  };
}

function pull(
  number: number,
  title: string,
  description: string,
  at: Date,
  github: Partial<NonNullable<Item["github"]>>,
): Item {
  return {
    id: `github:acme/widgets#${number}`,
    source: "gmail",
    title,
    description,
    priority: null,
    due: null,
    deadline: null,
    activityAt: at.toISOString(),
    context: `acme/widgets#${number}`,
    tags: [],
    url: `https://github.com/acme/widgets/pull/${number}`,
    gmail: { threadIds: [`t${number}`], unread: number === 128 || number === 137 || number === 141, messages: 4, unreadMessages: number === 128 ? 2 : 1 },
    github: {
      repo: "acme/widgets",
      number,
      kind: "pull",
      state: "open",
      review: null,
      closedAs: null,
      reason: "mention",
      comment: null,
      ...github,
    },
  };
}

const notifications: Item[] = [
  pull(128, "Promote widgets into core", "3 comments from octocat, hubber · review requested by octocat", new Date(2026, 8, 24, 7, 40), {
    reason: "review_requested",
    review: "review_required",
    checks: "pending",
    reviewRequested: "you",
    myReview: "requested",
    unreadQuotes: [
      { author: "octocat", text: "requested your review" },
      {
        author: "hubber",
        text: "I'd keep the gadget adapters out of core for now. They pull in the whole gadget runtime, and most widgets never touch it. Could we ship core first and follow up with an adapter package?",
      },
    ],
    comment: {
      author: "hubber",
      text: "I'd keep the gadget adapters out of core for now. They pull in the whole gadget runtime, and most widgets never touch it. Could we ship core first and follow up with an adapter package?",
    },
  }),
  pull(137, "Tidy the widget cache", "1 comment from hubber · review requested of acme/reviewers by octocat · approved by hubber", new Date(2026, 8, 24, 6, 15), {
    reason: "review_requested",
    review: "approved",
    checks: "passing",
    reviewRequested: "others",
    unreadQuotes: [{ author: "hubber", text: "Looks good to me. Merging after lunch unless anyone objects." }],
    comment: { author: "hubber", text: "Looks good to me. Merging after lunch unless anyone objects." },
  }),
  pull(141, "Cache widget lookups per request", "1 comment from hubber · approved by hubber", new Date(2026, 8, 24, 5, 50), {
    reason: "author",
    review: "approved",
    checks: "passing",
    mergeMethods: ["merge", "squash", "rebase"],
    unreadQuotes: [{ author: "hubber", text: "approved" }],
  }),
  pull(139, "Split the gadget cache by region", "1 comment from github-actions[bot] · review requested of acme/reviewers by octocat", new Date(2026, 8, 23, 17, 20), {
    reason: "review_requested",
    review: "review_required",
    checks: "passing",
    reviewRequested: "team",
    myReview: "requested",
  }),
  pull(143, "Log widget cache misses", "review requested of acme/reviewers by octocat · approved by you", new Date(2026, 8, 23, 16, 40), {
    reason: "review_requested",
    review: "approved",
    checks: "passing",
    reviewRequested: "you",
    myReview: "approved",
  }),
  pull(131, "Drop the gadget feature toggle", "2 comments from hubber · approved by octocat · merged", new Date(2026, 8, 23, 16, 5), {
    state: "merged",
    reason: "review_requested",
  }),
  pull(133, "Read empty widgets back as absent", "1 comment from octocat · changes requested by hubber", new Date(2026, 8, 22, 11, 0), {
    review: "changes_requested",
    checks: "failing",
    reason: "author",
    comment: { author: "octocat", text: "Can we add a test for an empty gadget list too?" },
  }),
  pull(135, "Sketch a widget plugin API", "1 comment from hubber", new Date(2026, 8, 22, 9, 30), { state: "draft", reason: "author" }),
  {
    ...pull(44, "Support gadgets on the moon", "2 comments from octocat", new Date(2026, 8, 21, 12, 0), {
      repo: "acme/gadgets",
      kind: "issue",
      state: "closed",
      closedAs: "not_planned",
      reason: "mention",
    }),
    id: "github:acme/gadgets#44",
    context: "acme/gadgets#44",
    url: "https://github.com/acme/gadgets/issues/44",
  },
  {
    ...pull(42, "Gadgets break on Sundays", "4 comments from octocat, hubber", new Date(2026, 8, 21, 9, 0), {
      repo: "acme/gadgets",
      kind: "issue",
      state: "closed",
      closedAs: "completed",
      reason: "author",
    }),
    id: "github:acme/gadgets#42",
    context: "acme/gadgets#42",
    url: "https://github.com/acme/gadgets/issues/42",
  },
];

function item(overrides: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
    source: "todoist",
    description: "",
    priority: null,
    due: null,
    deadline: null,
    activityAt: null,
    context: "Widgets",
    tags: [],
    url: `https://app.todoist.com/app/task/${overrides.id}`,
    gmail: null,
    github: null,
    ...overrides,
    id: `todoist:${overrides.id}`,
  };
}

const items: Item[] = [
  item({
    id: "a1",
    title: "Reply to octocat about the widget launch date",
    priority: 1,
    due: { date: "2026-09-22", recurring: false },
    tags: ["email"],
  }),
  item({
    id: "a2",
    title: "Review the gadgets pull request",
    description: "Hubber asked for a second look at the migration before Friday.",
    priority: 2,
    due: { date: "2026-09-24", recurring: false },
    context: "Gadgets",
  }),
  item({
    id: "a3",
    title: "Weekly planning",
    priority: 3,
    due: { date: "2026-09-24T14:00:00", recurring: true },
    tags: ["routine", "planning"],
  }),
  item({
    id: "a4",
    title: "Draft the Acme Board announcement",
    due: { date: "2026-09-25", recurring: false },
  }),
  item({
    id: "a5",
    title: "Order new widget samples",
    due: { date: "2026-09-29", recurring: false },
    tags: ["errand"],
  }),
  item({
    id: "a6",
    title: "Renew the gadgets domain",
    priority: 2,
    due: { date: "2027-01-15", recurring: false },
    context: "Admin",
  }),
  item({ id: "a8", title: "Submit the widget grant report", priority: 1, deadline: "2026-09-16", context: "Admin" }),
  item({ id: "a7", title: "Someday: rewrite the widget docs", context: null }),
  item({ id: "a9", title: "Look into gadget insurance", context: "Inbox", inbox: true }),
];

const docComments: Item = {
  id: "gdocs:deck42",
  source: "gmail",
  title: "Widget roadmap",
  description: "Octocat mentioned you in a comment · 2 new comments from Hubber, Octocat · 1 resolved",
  priority: null,
  due: null,
  deadline: null,
  activityAt: new Date(2026, 8, 24, 8, 50).toISOString(),
  context: "Google Slides",
  tags: [],
  url: "https://docs.google.com/presentation/d/deck42/edit",
  gmail: { threadIds: ["d1", "d2"], unread: true, messages: 2, unreadMessages: 2 },
  github: null,
  doc: {
    app: "slides",
    documentId: "deck42",
    url: "https://docs.google.com/presentation/d/deck42/edit",
    mentioned: true,
    quotes: [
      { author: "Hubber", text: "Should gadgets move to Q1? The supplier slipped again.", url: "https://docs.google.com/presentation/d/deck42/edit?disco=A1" },
      { author: "Hubber", text: "resolved the comment", url: "https://docs.google.com/presentation/d/deck42/edit?disco=A1" },
      { author: "Octocat", text: "@hubber Fair to say this shifted to the gadget roadmap?", url: "https://docs.google.com/presentation/d/deck42/edit?disco=A2" },
    ],
  },
};

const invitation: Item = {
  ...email("t4", "Invitation: Widget review @ Fri Sep 25, 2026 12pm - 12:30pm (PDT)", "Hubber", new Date(2026, 8, 24, 7, 55), "Widget review. Join with Google Meet. You have been invited by Hubber to attend an event named Widget review on Friday Sep 25, 2026.", true),
  invite: { eventId: "evt1", response: "needsAction", cancelled: false },
};

const emails: Item[] = [
  email("t1", "Widget launch checklist", "Octocat", new Date(2026, 8, 24, 8, 4), "Here is the list we talked about. Can you look over the gadget section before noon?", true),
  email("t2", "Re: Gadget invoice for September", "Hubber", new Date(2026, 8, 23, 20, 9), "Thanks! I have attached the corrected invoice."),
  email("t3", "Acme Board: agenda for next week", "Acme Board", new Date(2026, 8, 19, 12, 0), "Please add any items to the shared agenda by Friday."),
  docComments,
  invitation,
];

const todoistOk: LoadedSource = {
  id: "todoist",
  name: "Todoist",
  state: "ok",
  query: "today | overdue | 7 days",
  count: items.length,
};

const gmailOk: LoadedSource = {
  id: "gmail",
  name: "Gmail",
  state: "ok",
  query: "in:inbox",
  count: emails.length + notifications.length,
};

/** Synced four minutes before `now`, so the header reads "synced 4m ago". */
const syncedAt = new Date(now.getTime() - 4 * 60_000).toISOString();

const ok: NowList = {
  // Sorted the way the server sorts, so the story shows the real order.
  items: mergeItems([items, emails, notifications]),
  sources: [todoistOk, gmailOk],
  fetchedAt: syncedAt,
};

/**
 * The page with its title bar, where the sync control lives. `listing` null is
 * the moment before the stored list has been read.
 */
function Frame({
  listing,
  pending,
  filter,
}: {
  listing: Listing | null;
  pending?: ReadonlyMap<string, PendingAction>;
  filter?: Filter;
}) {
  const fetchedAt = listing?.list?.fetchedAt;
  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium text-foreground">Now</span>
        <SyncStatus
          sweptAt={fetchedAt === undefined ? null : Date.parse(fetchedAt)}
          busy={listing?.syncing === true}
          onRefresh={noop}
        />
      </div>
      <ItemListView
        listing={listing}
        now={now}
        actions={actions}
        pending={pending}
        initialFilter={filter}
      />
    </div>
  );
}

function stored(list: NowList, syncing = false): Listing {
  // One row already has its thread, so the story shows Open thread beside Start thread.
  return { list, threads: { "github:acme/widgets#128": "thread-1" }, threadProjectId: null, syncing };
}

const actions = {
  onRsvp: noop,
  onMerge: noop,
  onArchive: noop,
  onMarkRead: noop,
  onComplete: noop,
  onReply: async () => true,
  onStartThread: noop,
  onOpenThread: noop,
};

export function Default() {
  return (
    <StoryCard>
      <StoryRow
        label="Items"
        hint="The page opens on Now: unread mail and Todoist's Inbox at the top, then overdue tasks, tasks due today, read mail still in the inbox, and tasks dated later. The header picks one section on the left or one source on the right, each with its count of every row."
      >
        <Frame listing={stored(ok)} />
      </StoryRow>
    </StoryCard>
  );
}

/** Anytime, each source on its own, and both sections stacked. */
export function Sections() {
  return (
    <StoryCard>
      <StoryRow label="Anytime" hint="Tasks with no date, most urgent first.">
        <Frame listing={stored(ok)} filter={{ section: "anytime" }} />
      </StoryRow>
      <StoryRow label="Gmail" hint="Gmail pressed on the right: every Gmail row, read or unread, newest first, and no section chosen.">
        <Frame listing={stored(ok)} filter={{ source: "gmail" }} />
      </StoryRow>
      <StoryRow label="Todoist" hint="Todoist pressed on the right: every task, soonest first, then undated.">
        <Frame listing={stored(ok)} filter={{ source: "todoist" }} />
      </StoryRow>
      <StoryRow label="Everything" hint="Nothing pressed: Now and Anytime stacked, each under its heading and count.">
        <Frame listing={stored(ok)} filter={null} />
      </StoryRow>
    </StoryCard>
  );
}

export function States() {
  return (
    <StoryCard>
      <StoryRow label="Opening" hint="Before the stored list has been read, which takes one database read.">
        <Frame listing={null} />
      </StoryRow>
      <StoryRow label="First sync" hint="Nothing stored yet, and the first sync is running.">
        <Frame listing={{ list: null, threads: {}, threadProjectId: null, syncing: true }} />
      </StoryRow>
      <StoryRow label="Syncing" hint="The stored list shows while a sync runs behind it.">
        <Frame listing={stored(ok, true)} />
      </StoryRow>
      <StoryRow
        label="Working"
        hint="A Todoist Inbox task completing, an email archiving, an invitation being accepted, and a pull request merging: each row is disabled until its request lands."
      >
        <Frame
          listing={stored(ok)}
          pending={
            new Map<string, PendingAction>([
              ["todoist:a9", "complete"],
              ["gmail:t1", "archive"],
              ["gmail:t4", "rsvp:accepted"],
              ["github:acme/widgets#141", "merge"],
            ])
          }
        />
      </StoryRow>
      <StoryRow label="Empty" hint="Every source synced and nothing matched.">
        <Frame
          listing={stored({
            ...ok,
            items: [],
            sources: [
              { ...todoistOk, query: "today & p1", count: 0 },
              { ...gmailOk, count: 0 },
            ],
          })}
        />
      </StoryRow>
      <StoryRow label="Gmail failed" hint="Its sign-in expired; the emails from the last good sync stay.">
        <Frame
          listing={stored({
            ...ok,
            sources: [
              todoistOk,
              {
                id: "gmail",
                name: "Gmail",
                state: "error",
                query: "in:inbox",
                message: "Token has been expired or revoked.",
                kept: emails.length,
              },
            ],
          })}
        />
      </StoryRow>
      <StoryRow label="Gmail not set up" hint="gws is not installed; Todoist still syncs.">
        <Frame
          listing={stored({
            items: mergeItems([items]),
            sources: [
              todoistOk,
              {
                id: "gmail",
                name: "Gmail",
                state: "unconfigured",
                hint: "Install the `gws` CLI and sign in with `gws auth login`, or point `gwsPath` at it with `bb plugin config now set gwsPath <path>`.",
              },
            ],
            fetchedAt: syncedAt,
          })}
        />
      </StoryRow>
      <StoryRow label="Todoist not set up" hint="No token saved yet.">
        <Frame
          listing={stored({
            items: mergeItems([emails]),
            sources: [
              {
                id: "todoist",
                name: "Todoist",
                state: "unconfigured",
                hint: "Set todoistApiToken with `bb plugin config now set todoistApiToken <token>`.",
              },
              gmailOk,
            ],
            fetchedAt: syncedAt,
          })}
        />
      </StoryRow>
    </StoryCard>
  );
}

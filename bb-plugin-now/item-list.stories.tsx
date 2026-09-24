import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SyncStatus } from "./components/ui/sync-status";

import type { Listing, NowList, SourceStatus } from "./now/contract";
import { ItemListView } from "./now/item-list";
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
    gmail: { threadIds: [`t${number}`], unread: number === 128 },
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
    comment: {
      author: "hubber",
      text: "I'd keep the gadget adapters out of core for now. They pull in the whole gadget runtime, and most widgets never touch it. Could we ship core first and follow up with an adapter package?",
    },
  }),
  pull(131, "Drop the gadget feature toggle", "2 comments from hubber · approved by octocat · merged", new Date(2026, 8, 23, 16, 5), {
    state: "merged",
    reason: "review_requested",
  }),
  pull(133, "Read empty widgets back as absent", "1 comment from octocat · changes requested by hubber", new Date(2026, 8, 22, 11, 0), {
    review: "changes_requested",
    reason: "author",
    comment: { author: "octocat", text: "Can we add a test for an empty gadget list too?" },
  }),
  pull(135, "Sketch a widget plugin API", "1 comment from hubber", new Date(2026, 8, 22, 9, 30), { state: "draft", reason: "author" }),
  {
    ...pull(44, "Support gadgets on the moon", "2 comments from octocat", new Date(2026, 8, 21, 12, 0), {
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
    context: "Inbox",
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
];

const emails: Item[] = [
  email("t1", "Widget launch checklist", "Octocat", new Date(2026, 8, 24, 8, 4), "Here is the list we talked about. Can you look over the gadget section before noon?", true),
  email("t2", "Re: Gadget invoice for September", "Hubber", new Date(2026, 8, 23, 20, 9), "Thanks! I have attached the corrected invoice."),
  email("t3", "Acme Board: agenda for next week", "Acme Board", new Date(2026, 8, 19, 12, 0), "Please add any items to the shared agenda by Friday."),
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
}: {
  listing: Listing | null;
  pending?: ReadonlyMap<string, PendingAction>;
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
      <ItemListView listing={listing} now={now} actions={actions} pending={pending} />
    </div>
  );
}

function stored(list: NowList, syncing = false, snoozed: Listing["snoozed"] = []): Listing {
  // One row already has its thread, so the story shows Open thread beside Start thread.
  return { list, snoozed, threads: { "github:acme/widgets#128": "thread-1" }, threadProjectId: null, syncing };
}

const actions = {
  onSnooze: noop,
  onUnsnooze: noop,
  onArchive: noop,
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
        hint="Todoist tasks that are overdue, today, timed and recurring, this week, next year, and undated, then the inbox newest first: GitHub notifications gathered per pull request or issue, with a suggested Archive on the merged and closed ones, and plain emails."
      >
        <Frame listing={stored(ok)} />
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
        <Frame listing={{ list: null, snoozed: [], threads: {}, threadProjectId: null, syncing: true }} />
      </StoryRow>
      <StoryRow label="Syncing" hint="The stored list shows while a sync runs behind it.">
        <Frame listing={stored(ok, true)} />
      </StoryRow>
      <StoryRow
        label="Working"
        hint="A task completing, an email archiving, and a pull request snoozing: each row is disabled until its request lands."
      >
        <Frame
          listing={stored(ok)}
          pending={
            new Map<string, PendingAction>([
              ["todoist:a2", "complete"],
              ["gmail:t1", "archive"],
              ["github:acme/widgets#128", "snooze"],
            ])
          }
        />
      </StoryRow>
      <StoryRow label="Snoozed" hint="Two items punted to tomorrow and next week, listed under the rest when opened.">
        <Frame
          listing={stored(
            { ...ok, items: ok.items.filter((kept) => kept.id !== "gmail:t2" && kept.id !== "todoist:a5") },
            false,
            [
              { item: emails[1]!, until: new Date(2026, 8, 25, 8, 0).toISOString() },
              { item: items.find((kept) => kept.id === "todoist:a5")!, until: new Date(2026, 8, 28, 8, 0).toISOString() },
            ],
          )}
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

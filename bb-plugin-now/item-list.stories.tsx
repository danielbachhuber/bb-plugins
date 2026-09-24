import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SyncStatus } from "./components/ui/sync-status";

import type { Listing, NowList, SourceStatus } from "./now/contract";
import { ItemListView } from "./now/item-list";
import { mergeItems } from "./now/items";
import type { Item } from "./now/types";

export default {
  title: "now/Item list",
};

/** Thursday morning, so the fixtures cover overdue, today, this week, and later. */
const now = new Date(2026, 8, 24, 9, 30);
const noop = () => {};

function email(id: string, title: string, from: string, at: Date, snippet: string): Item {
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
  };
}

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
  email("t1", "Widget launch checklist", "Octocat", new Date(2026, 8, 24, 8, 4), "Here is the list we talked about. Can you look over the gadget section before noon?"),
  email("t2", "Re: Gadget invoice for September", "Hubber", new Date(2026, 8, 23, 20, 9), "Thanks! I have attached the corrected invoice."),
  email("t3", "Acme Board: agenda for next week", "Acme Board", new Date(2026, 8, 19, 12, 0), "Please add any items to the shared agenda by Friday."),
];

const todoistOk: SourceStatus = {
  id: "todoist",
  name: "Todoist",
  state: "ok",
  query: "today | overdue | 7 days",
  count: items.length,
};

const gmailOk: SourceStatus = { id: "gmail", name: "Gmail", state: "ok", query: "in:inbox", count: emails.length };

/** Synced four minutes before `now`, so the header reads "synced 4m ago". */
const syncedAt = new Date(now.getTime() - 4 * 60_000).toISOString();

const ok: NowList = {
  // Sorted the way the server sorts, so the story shows the real order.
  items: mergeItems([items, emails]),
  sources: [todoistOk, gmailOk],
  fetchedAt: syncedAt,
};

/**
 * The page with its title bar, where the sync control lives. `listing` null is
 * the moment before the stored list has been read.
 */
function Frame({ listing }: { listing: Listing | null }) {
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
      <ItemListView listing={listing} now={now} />
    </div>
  );
}

function stored(list: NowList, syncing = false): Listing {
  return { list, syncing };
}

export function Default() {
  return (
    <StoryCard>
      <StoryRow
        label="Items"
        hint="Todoist tasks that are overdue, today, timed and recurring, this week, next year, and undated, then inbox threads newest first."
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
        <Frame listing={{ list: null, syncing: true }} />
      </StoryRow>
      <StoryRow label="Syncing" hint="The stored list shows while a sync runs behind it.">
        <Frame listing={stored(ok, true)} />
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

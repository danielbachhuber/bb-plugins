import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import type { NextList, SourceStatus } from "./next/contract";
import { ItemListView } from "./next/item-list";
import type { Item } from "./next/types";

export default {
  title: "next/Item list",
};

/** Thursday morning, so the fixtures cover overdue, today, this week, and later. */
const now = new Date(2026, 8, 24, 9, 30);
const noop = () => {};

function item(overrides: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
    source: "todoist",
    description: "",
    priority: null,
    due: null,
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
  item({ id: "a7", title: "Someday: rewrite the widget docs", context: null }),
];

const todoistOk: SourceStatus = {
  id: "todoist",
  name: "Todoist",
  state: "ok",
  query: "today | overdue | 7 days",
  count: items.length,
};

const ok: NextList = { items, sources: [todoistOk], fetchedAt: now.toISOString() };

function Frame({ list, refreshing }: { list: NextList | null; refreshing?: boolean }) {
  return (
    <div className="w-full rounded-lg border border-border bg-background">
      <ItemListView list={list} now={now} refreshing={refreshing} onRefresh={noop} />
    </div>
  );
}

export function Default() {
  return (
    <StoryCard>
      <StoryRow label="Items" hint="Overdue, today, timed and recurring, this week, next year, and undated.">
        <Frame list={ok} />
      </StoryRow>
    </StoryCard>
  );
}

export function States() {
  return (
    <StoryCard>
      <StoryRow label="Loading" hint="The first load, before the RPC answers.">
        <Frame list={null} />
      </StoryRow>
      <StoryRow label="Refreshing" hint="A refresh with the previous list still showing.">
        <Frame list={ok} refreshing />
      </StoryRow>
      <StoryRow label="Empty" hint="Every source loaded and nothing matched.">
        <Frame
          list={{ ...ok, items: [], sources: [{ ...todoistOk, query: "today & p1", count: 0 }] }}
        />
      </StoryRow>
      <StoryRow label="Unconfigured" hint="No source is set up yet.">
        <Frame
          list={{
            items: [],
            sources: [
              {
                id: "todoist",
                name: "Todoist",
                state: "unconfigured",
                hint: "Set todoistApiToken with `bb plugin config next set todoistApiToken <token>`.",
              },
            ],
            fetchedAt: now.toISOString(),
          }}
        />
      </StoryRow>
      <StoryRow label="Error" hint="Todoist rejected the filter.">
        <Frame
          list={{
            items: [],
            sources: [
              {
                id: "todoist",
                name: "Todoist",
                state: "error",
                query: "today &",
                message: "Returned 400: Invalid filter query",
              },
            ],
            fetchedAt: now.toISOString(),
          }}
        />
      </StoryRow>
    </StoryCard>
  );
}

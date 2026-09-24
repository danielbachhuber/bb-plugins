# bb-plugin-next

A [bb](https://getbb.app) plugin that puts what you have to do next on one
page, gathered from your sources: [Todoist](https://todoist.com) tasks and your
Gmail inbox.

## What it adds

A **Next** page in the left sidebar. It loads every configured source at once
and merges their items into one list: soonest due first (by due date or
deadline, whichever is sooner), most urgent first within a day, and undated
items last, newest activity first. Each row has an icon for its source, the
item's title (linking to it in its source), description, due date, deadline,
tags, where it came from (a Todoist project, or an email's sender), and a
P1–P3 tag. Overdue dates are red and today's are green; a recurring item has a
repeat icon. An email shows when its latest message arrived.

The list is stored in the plugin's database, so the page opens with the last
sync's items at once instead of waiting on Todoist and Gmail. It syncs in the
background every 15 minutes, and opening the page syncs a list older than a
minute. The page's title bar says when it last synced and has a Refresh
button that syncs now. Syncs that overlap share one run.

Above the list, each source that loaded shows its name, what it was asked for,
and how many items it returned. A source that is not set up shows what to
configure, and a source that failed shows its error. Either way the other
sources' items still appear, and a failed source keeps its items from the last
good sync, with a note saying how many.

The page only reads. Completing or editing an item still happens in its
source.

## Sources

### Todoist

The open tasks matching one
[Todoist filter query](https://todoist.com/help/articles/introduction-to-filters-V98wIH).
Copy your API token from Todoist under Settings → Integrations → Developer,
then save it:

```sh
bb plugin config next set todoistApiToken <token>
```

The filter defaults to `today | overdue`. To change it:

```sh
bb plugin config next set todoistFilter "#Work & (today | overdue | p1)"
```

Settings are read on every sync, so a change shows up on the next one; press
Refresh to see it at once. The token is a bb secret setting, stored
under `~/.bb` and never sent to the frontend.

A task matched only through its deadline (Todoist's `overdue` includes
missed deadlines) has no due date, and sorts by the deadline instead.

One sync makes two requests to the Todoist API v1, in parallel:
`GET /api/v1/tasks/filter` with the saved query, and `GET /api/v1/projects` to
name each task's project. Both follow `next_cursor` 200 items at a time.
Nothing runs in the background, and nothing is requested until a token is set.

### Gmail

The threads matching one Gmail search, read through the
[`gws`](https://github.com/googleworkspace/cli) CLI, so the plugin holds no
Google credentials of its own. Sign `gws` in once with `gws auth login`. Gmail
is on by default and reads `in:inbox`, the 25 most recent threads:

```sh
bb plugin config next set gmailQuery "in:inbox is:unread"
bb plugin config next set gmailMaxThreads 50
bb plugin config next set gmailEnabled false    # hide Gmail
bb plugin config next set gwsPath /opt/homebrew/bin/gws   # when gws is not on bb's PATH
```

Each thread is one row: the first message's subject, and the latest
message's sender, snippet, and time. The link opens the thread in Gmail's web
app, in the account `gws` is signed into.

One sync runs `gws gmail users threads list` with the search, then
`threads get` for each thread's headers, five at a time. The signed-in
address is asked for once per plugin load, for the links. If `gws` is
missing, the page says how to set it up; if it fails (an expired sign-in, for
example), its error shows above the list and the Todoist tasks still load.

### Sync interval

```sh
bb plugin config next set syncIntervalMinutes 30   # 5, 15 (the default), 30, or 60
```

## Adding a source

A source is a `Source` from `next/sources.ts`: an id, a name, the query it
reports, and a `load()` that returns its status and its items as `Item`s
(`next/types.ts`). Give it a directory of its own beside `todoist/`, add its
settings to `server.ts` with the source's name as a prefix, and add it to the
list `server.ts` passes to `loadSources`.

## Layout

| Path | What it holds |
| --- | --- |
| `next/types.ts` | The `Item` shape every source produces |
| `next/sources.ts` | The `Source` interface, loading every source into one list, and keeping a failed source's last items |
| `next/items.ts` | The order the merged list is in |
| `next/due.ts` | How a due date reads ("Today 14:00", "Tuesday", "Jan 15, 2027") and its color, and how an email's time reads |
| `next/contract.ts` | The RPC contract: `items_list` reads the stored list, `items_sync` syncs |
| `next/store.ts` | The database tables and the stored list's reads and writes |
| `next/item-list.tsx` | The page's display component, which loads nothing itself |
| `todoist/api.ts` | The only module that calls Todoist: auth, pagination, and error messages |
| `todoist/normalize.ts` | Turning Todoist task payloads into items |
| `todoist/source.ts` | Todoist as a `Source`, built from its settings |
| `gmail/gws.ts` | The only module that runs `gws`: spawning it, reading its JSON, and its errors |
| `gmail/normalize.ts` | Turning Gmail thread payloads into items: sender names, snippets, links |
| `gmail/source.ts` | Gmail as a `Source`: the thread search and each thread's headers |
| `item-list.stories.tsx` | The page in every state, for `npm run storybook` at the root |
| `server.ts` | The settings, the sync (shared between callers), the background service, and the RPC handlers |
| `app.tsx` | The sidebar page and its title-bar sync control, which read the stored list and sync on open |
| `components/ui/sync-status.tsx` | The "synced 4m ago" label and Refresh button, the same file the sweeps carry |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload next
```

For visual changes, run `npm run storybook` at the repository root and open
**next / Item list**.

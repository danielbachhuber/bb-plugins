# bb-plugin-now

A [bb](https://getbb.app) plugin that puts what needs doing now on one
page, gathered from your sources: [Todoist](https://todoist.com) tasks and your
Gmail inbox.

## What it adds

A **Now** page in the left sidebar, whose entry shows how many rows need
action: everything the last sync found, less what is snoozed. It loads every
configured source at once and merges their items into one list: soonest due
first (by due date or deadline, whichever is sooner), most urgent first within
a day, and undated items last, newest activity first. Each row starts with a
narrow column holding its source's own mark (Todoist, Gmail, or GitHub) and
its date: when it is due, else its deadline, else when its latest email
arrived. Beside that are the item's title (linking to it in its source),
description, and a details line with the row's actions, tags, and where it
came from (a Todoist project, or an email's sender), with a P1–P3 tag beside
the title. Overdue dates are red and today's are green; a recurring item has a
repeat icon.

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

## Row actions

- **Complete** (on a Todoist row, in its details line) completes the task in
  Todoist and takes the row off the page.
- **Archive** (on an email row, in its details line) takes the row's threads
  out of the Gmail inbox and the row off the page. On a GitHub row whose pull
  request has merged or closed, or whose issue has closed, it is tinted purple
  and says so, to suggest it.
- **Snooze** (the pause icon, at the right of every row) hides the row until
  later today (three hours), tomorrow at 8:00, or next Monday at 8:00. The
  snooze is kept in this plugin's database; nothing changes in Todoist or
  Gmail. A snoozed row comes back early if it has newer activity, such as a
  new comment on a snoozed pull request. Snoozed rows are listed, closed, under
  the rest, where each can be unsnoozed.

Each of these says what it did in a toast with **Undo**, which reopens the
task, puts the threads back in the inbox, or ends the snooze, and returns the
row to where it was. A recurring task is the exception: completing it moves
it to its next date, and Todoist cannot move it back, so its toast says so
instead of offering Undo. Undo is for the moment after the click; it does not
survive a reload of the plugin.

Every row also has **Start thread** in its details line, which opens bb's
new-thread composer in a dialog, with the row's facts already in the prompt
(its title, link, dates, description, and latest comment) and room for what
the thread should do. The composer's project defaults to the
`threadProjectId` setting when it is set. Once a thread is started, the row
offers **Open thread** instead, until that thread is archived or deleted.

A GitHub row also has **Reply** in its details line, which opens a box under
the row that comments on the pull request or issue through the GitHub API, as
you. ⌘↩ sends it. Above the details line, the row quotes the most recent thing
someone wrote, taken from its email's snippet, so a long comment arrives
already cut short.

Completing or editing a Todoist task still happens in Todoist, and replying
to an email that is not from GitHub still happens in Gmail.

## Sources

### Todoist

The open tasks matching one
[Todoist filter query](https://todoist.com/help/articles/introduction-to-filters-V98wIH).
Copy your API token from Todoist under Settings → Integrations → Developer,
then save it:

```sh
bb plugin config now set todoistApiToken <token>
```

The filter defaults to `today | overdue`. To change it:

```sh
bb plugin config now set todoistFilter "#Work & (today | overdue | p1)"
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
bb plugin config now set gmailQuery "in:inbox is:unread"
bb plugin config now set gmailMaxThreads 50
bb plugin config now set gmailEnabled false    # hide Gmail
bb plugin config now set gwsPath /opt/homebrew/bin/gws   # when gws is not on bb's PATH
```

Each thread is one row: the first message's subject, and the latest
message's sender, snippet, and time. The link opens the thread in Gmail's web
app, in the account `gws` is signed into.

GitHub's notification emails are gathered into one row per pull request or
issue, however many threads they arrive in. The row is recognized from the
email's headers (`X-GitHub-Reason`, and the `owner/repo/pull/N` in
`In-Reply-To`), so a person's email that only links to GitHub stays an email.
Its title is the pull request's, its link goes to GitHub, and its description
summarizes the notifications from their fixed phrasings: "3 comments from
octocat, hubber · review requested by octocat · approved by hubber · merged".
Beside the title it shows what the pull request is waiting on (review
requested, changes requested, approved) and its state in GitHub's own colors:
open, draft, merged, or closed, and for an issue, closed as completed or as not
planned.

That state comes from `gh`, asked about every pull request and issue in one
GraphQL query per sync, because an email only says what was true when it was
sent: a pull request merged without a "Merged" email would otherwise still
read as open. When `gh` is missing or fails, the row uses the
`X-GitHub-PullRequestStatus` of its latest email instead.

```sh
bb plugin config now set ghPath /opt/homebrew/bin/gh   # when gh is not on bb's PATH
bb plugin config now set threadProjectId <project-id>  # where Start thread opens
```

One sync runs `gws gmail users threads list` with the search, then
`threads get` for each thread's headers, five at a time. The signed-in
address is asked for once per plugin load, for the links. If `gws` is
missing, the page says how to set it up; if it fails (an expired sign-in, for
example), its error shows above the list and the Todoist tasks still load.

### Sync interval

```sh
bb plugin config now set syncIntervalMinutes 30   # 5, 15 (the default), 30, or 60
```

## Adding a source

A source is a `Source` from `now/sources.ts`: an id, a name, the query it
reports, and a `load()` that returns its status and its items as `Item`s
(`now/types.ts`). Give it a directory of its own beside `todoist/`, add its
settings to `server.ts` with the source's name as a prefix, and add it to the
list `server.ts` passes to `loadSources`.

## Layout

| Path | What it holds |
| --- | --- |
| `now/types.ts` | The `Item` shape every source produces |
| `now/sources.ts` | The `Source` interface, loading every source into one list, and keeping a failed source's last items |
| `now/items.ts` | The order the merged list is in |
| `now/due.ts` | How a due date reads ("Today 14:00", "Tuesday", "Jan 15, 2027") and its color, and how an email's time reads |
| `now/contract.ts` | The RPC contract: reading the stored list, syncing, and the row actions |
| `now/store.ts` | The database tables: the stored list, snoozes, and the threads started from rows |
| `now/snooze.ts` | The snooze menu's times, and which items a snooze is hiding |
| `now/item-row.tsx` | One row: its details, state chips, buttons, and reply box |
| `now/brand-icon.tsx` | The Todoist, Gmail, and GitHub marks (Simple Icons, CC0) |
| `now/thread-prompt.ts` | What Start thread's composer opens with |
| `now/start-thread-dialog.tsx` | bb's new-thread composer in a dialog, adapted from the sweeps' |
| `now/item-list.tsx` | The page's display component, which loads nothing itself |
| `todoist/api.ts` | The only module that calls Todoist: auth, pagination, and error messages |
| `todoist/normalize.ts` | Turning Todoist task payloads into items |
| `todoist/source.ts` | Todoist as a `Source`, built from its settings |
| `gmail/gws.ts` | The only module that runs `gws`: spawning it, reading its JSON, and its errors |
| `gmail/normalize.ts` | Turning Gmail thread payloads into items: sender names, snippets, links |
| `gmail/source.ts` | Gmail as a `Source`: the thread search and each thread's headers |
| `gmail/inbox.ts` | Turning a page of threads into rows, with GitHub notifications gathered per pull request or issue |
| `github/notifications.ts` | Reading a GitHub notification: which pull request or issue, what happened, and the summary |
| `github/state.ts` | The GraphQL query for every reference's state, and reading its answer |
| `github/gh.ts` | The only module that runs `gh`: the state query and posting a comment |
| `item-list.stories.tsx` | The page in every state, for `npm run storybook` at the root |
| `server.ts` | The settings, the sync (shared between callers), the background service, and the RPC handlers |
| `app.tsx` | The sidebar page and its title-bar sync control, which read the stored list and sync on open |
| `components/ui/sync-status.tsx` | The "synced 4m ago" label and Refresh button, the same file the sweeps carry |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload now
```

For visual changes, run `npm run storybook` at the repository root and open
**now / Item list**.

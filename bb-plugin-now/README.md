# bb-plugin-now

A [bb](https://getbb.app) plugin that puts what needs doing now on one
page, gathered from your sources: [Todoist](https://todoist.com) tasks and your
Gmail inbox.

## What it adds

A **Now** page in the left sidebar, whose entry shows how many rows need
action: everything the last sync found, less what is snoozed. It loads every
configured source at once and merges their items into one list, shown one
section at a time. The header picks the section on the left (**Now**,
**Inbox**, **Anytime**, each with its count) and narrows it to one source on
the right (**Gmail**, **Todoist**, each with its count in that section; press
one again to see both, and hover one for its query). Each row goes in one
section, checked in this order:

- **Inbox**: everything that needs a decision before it is work. Every Gmail
  row, read or not, since each is a thread still in the Gmail inbox (email,
  GitHub notifications, document comments, invitations); and every task in
  Todoist's Inbox project, whatever its date. Mail comes first, newest first,
  then the Todoist Inbox tasks.
- **Now**: any other task overdue or due today, by its due date or its
  deadline, whichever is sooner.
- **Anytime**: every other task, dated later or not at all.

The page opens on Now, from every source. In Now and Anytime the soonest come
first, then the most urgent, and undated tasks last. Each row starts
with its source's icon, drawn like bb's own outline icons (GitHub, Mail, and a
Todoist mark in the same style), then the item's title (linking to it in its
source) with its date at the right in one short form ("Sep 21", or the time
for today), its description, and a details line with the row's actions, tags,
and where it came from (a Todoist project, or an email's sender), with a P1–P3
tag beside the title. A date or deadline that is today or already past is
red; nothing else is colored for its date. A recurring item
has a repeat icon.

The list is stored in the plugin's database, so the page opens with the last
sync's items at once instead of waiting on Todoist and Gmail. It syncs in the
background every 15 minutes, and opening the page syncs a list older than a
minute. The page's title bar says when it last synced and has a Refresh
button that syncs now. Syncs that overlap share one run. A row completed,
archived, or restored with Undo while a sync is running stays that way when
the sync finishes, even though what the sync read predates it.

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
  and says so, to suggest it. It does the same, saying "you reviewed", on a
  pull request whose review you have given and nobody has asked for again,
  and saying "not your review" on one you are notified about only because
  someone else, or a team you are not on, was asked to review it.
- **Open and archive** (first in the details line of a row that mentions you
  by name: a GitHub @mention of you, not of a team you are on, or a Google
  document comment that mentions or assigns you) opens the row's link, the
  newest discussion for a document, and archives the row in the same click,
  since once it is read there is nothing to come back for.
- **Yes, No, Maybe** (under a calendar invitation's snippet, after "Going?")
  replies to the event in Google Calendar as you, the way the same links in
  the email do. Your current reply is the one marked, read from Calendar on
  each sync, so a reply made in Calendar or Gmail shows here too. The row
  stays where it is, and once you have replied its Archive is tinted and says
  "you replied". A canceled event says so instead, and suggests Archive.
- **Snooze** (the pause icon, at the right of every row) hides the row until
  later today (three hours), tomorrow at 8:00, or next Monday at 8:00. The
  snooze is kept in this plugin's database; nothing changes in Todoist or
  Gmail. A snoozed row comes back early if it has newer activity, such as a
  new comment on a snoozed pull request. Snoozed rows are listed, closed, under
  the rest, where each can be unsnoozed.

While one of these waits on Todoist, Gmail, or the plugin's server, its row
dims and its buttons are disabled, and the button says what it is doing
("Completing…", "Archiving…", "Snoozing…") beside a spinner. The row stays
that way until the refreshed list arrives, so it goes straight to gone rather
than flashing back first.

Each of these says what it did in a toast with **Undo**, which reopens the
task, puts the threads back in the inbox, or ends the snooze, and returns the
row to where it was. A recurring task is the exception: completing it moves
it to its next date, and Todoist cannot move it back, so its toast says so
instead of offering Undo. Undo is for the moment after the click; it does not
survive a reload of the plugin. Undo shows "Restoring…" in the toast until it
has finished.

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
already cut short. When some of its messages are unread, it quotes each of
those instead, oldest first, with what happened for one that has no words
("approved", "requested review of acme/reviewers"), up to five and then a
count of the rest.

A pull request you opened that GitHub would let you merge now has **Merge**
at the right of the card that ends the row: GitHub Context's split button, which merges
with the method it names (squash merge unless the repository does not allow
it) and whose menu picks another of the methods the repository allows. It
merges through `gh pr merge`, as you, and then reads the pull request back,
so a repository with a merge queue shows it still open and queued rather
than merged. The button shows only when the pull request is open and not a
draft, you can write to the repository, and GitHub's merge state is clean or
has only non-required checks failing. It does not show on someone else's
pull request, even where you could merge it, since that merge is theirs to
make. Once merged, the row suggests Archive.

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
name each task's project and find the Inbox. Both follow `next_cursor` 200
items at a time.
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
message's sender, snippet, and time. A row with any unread message has a bold
title and a blue dot beside its mark, as in Gmail; that holds for the GitHub
rows below too. A row of several messages also says how many are new ("1
new") beside its date. Reading it in Gmail clears it on the next sync. The
link opens the thread in Gmail's web app, in the account `gws` is signed
into.

GitHub's notification emails are gathered into one row per pull request or
issue, however many threads they arrive in. The row is recognized from the
email's headers (`X-GitHub-Reason`, and the `owner/repo/pull/N` in
`In-Reply-To`), so a person's email that only links to GitHub stays an email.
Its title is the pull request's, its link goes to GitHub, and its description
summarizes the notifications from their fixed phrasings: "3 comments from
octocat, hubber · review requested by octocat · approved by hubber · merged".
A review asked of a team or of someone else says whose ("review requested of
acme/reviewers by octocat"), since GitHub notifies you of a request of your
team with the same reason as a request of you. Whose it is comes from
GitHub, which works out team membership itself: a request still waiting on
you, directly or through a team you are on (labelled **Team review
requested**), is yours to pick up; a review you have given makes it yours
and done, including a team's request that your review answered; anything
else is someone else's. GitHub counts an author's replies to review comments
as reviews, so your own pull request never counts as reviewed by you. When
`gh` cannot be asked, a team's request stays yours while the team is still
among the pending reviewers the emails named.

The row ends in GitHub Context's banner card, below its details line: the
pull request or issue's state icon, then for an open pull request with checks
on its latest commit the GitHub mark with bb's check-status dot (a check for
passing, a cross for failing, a dot for pending), then `acme/widgets#141` and
your review in GitHub Context's words ("Review requested", "Team review
requested", "Re-review requested", "You approved", "You requested changes",
"You commented"), or else what it is waiting on ("Approved", "Changes
requested"), or its state once it is not open ("Draft",
"Merged", "Closed", "Not planned"). The segment links to it on GitHub.

That state comes from `gh`, asked about every pull request and issue in one
GraphQL query per sync, because an email only says what was true when it was
sent: a pull request merged without a "Merged" email would otherwise still
read as open. When `gh` is missing or fails, the row uses the
`X-GitHub-PullRequestStatus` of its latest email instead.

```sh
bb plugin config now set ghPath /opt/homebrew/bin/gh   # when gh is not on bb's PATH
bb plugin config now set threadProjectId <project-id>  # where Start thread opens
```

Google's comment notifications, from `comments-noreply@docs.google.com`, are
gathered the same way into one row per Google Docs, Slides, or Sheets file.
Their headers say little, so these threads, and only these, are read again
with their bodies, whose HTML has a fixed layout: a headline, the document,
and each discussion's posts with the author and a "New" badge. The row's
title is the document's, its link opens the newest discussion, **Open in
Google Docs** (or Slides, or Sheets) in its details line opens the document
itself, and its description is the latest headline and what is new: "Octocat mentioned you in
a comment · 2 new comments from Octocat, Hubber · 1 resolved". Below that it
quotes each new comment, from the unread emails, or from the latest one once
they are all read, with an action in words ("resolved the comment"), and an
external-link icon after each that opens the document at that comment. A
**Mentioned** label shows when one of them mentioned you or assigned you
something.

Calendar's invitations carry an `X-Google-Calendar-Notification` header
(`eventCreated`, `timeOrRecurrenceUpdated`, `eventCancelled`, and so on;
someone else's reply, `rsvpAccepted`, asks nothing of you). The event is
named only in the body's links, whose `eid` decodes to the event's id and your
address, so those threads are read in full too. Each sync then asks Calendar
for every invitation's event (`gws calendar events get`) and reads your reply
from its guest list. Replying sends that guest list back with your entry
changed (`gws calendar events patch`), since Calendar replaces the whole list
on a patch.

One sync runs `gws gmail users threads list` with the search, then
`threads get` for each thread's headers, five at a time, and once more in full
for each thread of Google comment notifications or calendar invitations. The signed-in
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
| `now/pull-request-bar.tsx` | A GitHub row's card, in GitHub Context's banner chrome: the pull request segment and room for Merge |
| `now/merge-button.tsx` | The Merge split button, from GitHub Context's banner |
| `now/github-favicon-icon.tsx` | The GitHub mark with a check-status dot, vendored from bb by way of GitHub Context |
| `now/brand-icon.tsx` | The source icons: bb's GitHub, Mail, and file outlines, and a Todoist mark drawn to match |
| `now/sections.ts` | Which section a row goes in, and the short date each row shows |
| `now/thread-prompt.ts` | What Start thread's composer opens with |
| `now/start-thread-dialog.tsx` | bb's new-thread composer in a dialog, adapted from the sweeps' |
| `now/item-list.tsx` | The page's display component, which loads nothing itself |
| `todoist/api.ts` | The only module that calls Todoist: auth, pagination, and error messages |
| `todoist/normalize.ts` | Turning Todoist task payloads into items |
| `todoist/source.ts` | Todoist as a `Source`, built from its settings |
| `gmail/gws.ts` | The only module that runs `gws`: spawning it, reading its JSON, and its errors |
| `gmail/normalize.ts` | Turning Gmail thread payloads into items: sender names, snippets, links |
| `gmail/source.ts` | Gmail as a `Source`: the thread search and each thread's headers |
| `gmail/inbox.ts` | Turning a page of threads into rows, with GitHub notifications gathered per pull request or issue and Google comment notifications per document |
| `github/notifications.ts` | Reading a GitHub notification: which pull request or issue, what happened, and the summary |
| `github/state.ts` | The GraphQL query for every reference's state, checks, and whether you can merge it, and reading its answer |
| `github/gh.ts` | The only module that runs `gh`: the state query, merging, and posting a comment |
| `calendar/invite.ts` | Which event an invitation is about, your reply to it, and the guest list that changes it |
| `calendar/api.ts` | The only module that asks Google Calendar: each event's reply, and replying |
| `gdocs/notifications.ts` | Reading a Google Docs, Slides, or Sheets comment email's HTML: the document, its discussions, who wrote what, and the summary |
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

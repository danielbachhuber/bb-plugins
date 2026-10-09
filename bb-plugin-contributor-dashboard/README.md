# bb-plugin-contributor-dashboard

A dashboard of how people contribute to one GitHub repository. A Contributor
Dashboard page in the sidebar draws its sections from a local copy of the
repository's pull requests, reviews, and issues.

## The page

The panel's title bar says when the mirror last synced and has the **Sync**
button, where bb's other plugins put theirs. The top of the page itself names
the repository and has the span picker, which every section follows: 2 weeks,
6 weeks (the default), 3 months, and a date range for the question the presets
do not answer. The range offers the two years the mirror reaches back and
nothing later than today, the cross beside the dates drops it back to 6 weeks,
and whatever is chosen is remembered for next time.
While the first sync is still reaching back, the page says how far it has got.

A chart has one point per bucket, and how long a bucket is follows the span: a
month or less is drawn by day, up to half a year by week starting on Monday,
and anything longer by month. A bucket is always whole, so a range starting
midweek is charted from that week's Monday.

Under the header the page has four sections: an **Overview**, then
**Issues**, **Pull requests**, and **Releases**.

### Overview

A flow diagram across the delivery model's six stages, Identify, Define,
Execute, Verify, Release and Learn, with each step the mirror can see placed
in the stage the model puts it in. Define and Learn happen outside GitHub,
and Release ends at the merge, so those columns say so rather than drawing
nothing.

Two things are drawn, and they answer different questions:

- **A box is a step's queue now:** how many are waiting in it, and how long
  half of those that left it in the period took. Clicking a box opens the
  step's page.
- **A line is what moved in the period:** every issue and pull request opened
  in it, and where each one has got to, the line thicker for more. Both rows
  share one scale, so a line's width compares across them.

Neither issues nor pull requests walk a straight line, so the paths that skip
a step or go back are drawn too, as amber dashed lines: issues assigned
without ever reaching a milestone or project, and pull requests merged with
no review or sent back with changes requested. Pull requests reviewed though
nobody was asked are written under the line into Code review, and those
closed unmerged leave the row on a grey line. A path nothing took in the
period is left out.

The mirror does not hold which pull request is for which issue, so the
diagram joins the two rows with a dotted line that says so.

What counts on the lines, for everything opened in the period, bots left out:

| Line | Counts |
| --- | --- |
| into a plan | issues that reached a milestone or project |
| assigned without a plan | issues assigned that never reached one |
| closed after someone took them | closed issues that had been assigned |
| closed untriaged | closed issues that reached neither |
| spent time as drafts | pull requests that were ever a draft |
| reviewer asked | pull requests with at least one review request |
| reviewed unasked | pull requests reviewed with no request |
| approved | pull requests approved by someone other than the author |
| sent back with changes requested | pull requests with at least one request for changes |
| merged with no review | merged pull requests nobody but the author reviewed |
| closed unmerged | pull requests closed without merging |

The counts come from the rows the stages already read, so the diagram makes
no request to GitHub of its own.

### Issues and Pull requests

Each section opens with a row per step, named for the node in the delivery
model it comes from, each saying in a line what its clock measures:

| Stage | Reads | From | To |
| --- | --- | --- | --- |
| Triage | issues | opened | it reaches a milestone or project |
| Assign ownership | issues | in a milestone or project | someone is assigned |
| Implement change | pull requests | opened as a draft | marked ready for review |
| Prepare pull request | pull requests | ready for review | a reviewer is asked |
| Code review | pull requests | a reviewer asked | they leave a review |
| Merge decision | pull requests | approved | merged |

The mirror also times Implement change, from a draft to ready for review, but
the page leaves it out: most pull requests never open as drafts, so it
measures only a fraction of them. Its page is still at its address.

Within each object type the stages divide one timeline, so a pull request is in
at most one pull request stage at a time, and an issue in at most one issue
stage.

The two sections time their steps separately because they work on different time scales:
issue stages run in weeks and pull request stages often in minutes, so one
shared scale would flatten every pull request row into its first pixel. Each
section's scale is named in its header row, and a bar in one cannot be
compared with a bar in the other.

What the issue stages can and cannot say: they measure the milestone and
project habit as much as the work, and everything in Identify and Define that
happens before an issue exists is invisible here. An issue closed before it
reached a stage's end left the flow rather than passing through it, so it
counts neither as a duration nor as waiting. Each row shows how many are in the stage now, then the
**median**, **p75** and **p90** of how long it took the ones that left it in
the period: half pass the stage within the median, a quarter take longer than
the p75, and a tenth longer than the p90. The bar runs to the median and the
two ticks mark p75 and p90, on that group's scale. The small line on the
right is the median in each bucket, green where it is falling and red where it
is rising.

Three numbers rather than one, because an average is the wrong summary here: on
a real repository the mean time to a first review is three times the median,
pulled up by a few reviews that waited days. The median alone has the opposite
problem, since it is blind to exactly those.

#### A stage's page

Clicking a stage name opens its page, at
`contributor-dashboard/stage/<stage>`. It leads with two charts: **how long it
took**, every pull request that left the stage in the period counted into
bands, and **how long the queue has waited**, the ones in the stage now, with
the bands past three days in red. Under them is the list of what is in the
stage, longest wait first, twenty-five to a page, drawn as **A row in a list**
describes below. Under that, **each day, week, or month**, whichever the period
is drawn in: bars for how many left the stage in each one, with its median and
p90 drawn over them, so a slow one can be read against a busy one.

The queue is what is in the stage now, whatever the period, since a pull
request waiting three months is waiting today.

### A row in a list

Every list of issues and pull requests draws the same row: the number and
title, linking to GitHub, then what that list has to say about it, then two
things to do with it.

**Who owns it** comes first on the right. Initials in a circle for each
assignee, up to three, with the full list on hover. Where nobody is assigned,
which is most rows, the row carries the amber outline of a person instead: on
a real repository seven open issues in ten have no assignee, so the absence is
the common case and the one worth seeing. Initials rather than avatars,
because avatars would be twenty-five image requests for a page that otherwise
makes none. The person's own pull requests are the exception, since naming an
assignee on a list of someone's own work says nothing.

**Start a thread** opens bb's composer with the issue or pull request already
written into the prompt, and the project, provider, environment and branch
pickers the composer always has. Once a thread exists for that row, the glyph
changes and the button opens it rather than starting a second one; the plugin
remembers which thread belongs to which number in its own table, which is the
only thing in its database that does not come from GitHub.

**Copy link** writes the title and URL to the clipboard in both flavours,
rich text for a document or a chat window and markdown for an editor or a
GitHub comment, and the glyph turns to a tick for a moment.

Both are icons rather than labels, with the label on hover, because the row
has to stay one line: the lists are long and the information in them is worth
more than the words around the buttons.

### PR velocity and Review velocity

At the end of the Pull requests section, two sets of small multiples, one card per person, busiest first. **PR
velocity** draws the pull requests each person **opened** and the ones that
**merged**; **Review velocity** draws the reviews **requested** of them and the
ones they **gave**. Both totals for the period sit beneath the name, and the
card's busiest bucket is written beside it as its peak. Hovering a point shows
its counts.

Neither pair of totals is a share of the other. A person can review a pull
request nobody asked them to, so reviews given often outnumber reviews
requested, and a pull request counts as merged in the bucket it merged in
rather than the one it was opened in, so a bucket can merge more than it
opened.

Every card in a section shares one scale, so a busy person's lines sit higher
than a quiet one's. That leaves a problem on a repository where three people do
most of the work: a line under a tenth of the scale is a few pixels off the
axis whatever its shape. Those people fold into rows of names and counts under
the cards, still clickable, and **Show all** draws everyone.

What counts in PR velocity:

- **Opened:** each pull request, counted for whoever opened it, in the bucket
  it was opened in. Bots are left out.
- **Merged:** each of their pull requests that merged, counted in the bucket it
  merged in, which may be later than the one it was opened in and may be
  outside the period even when the opening was not.

What counts in Review velocity:

- **Requested:** each review request naming the person, counted in the bucket
  it was made in. A re-request counts again, because it asks for another
  review. A request made of a team counts for the first person who reviews
  after it, unless they were also asked directly in the meantime or the team
  request was withdrawn first. A team request nobody picked up counts for no one.
- **Given:** each review the person submitted, counted in the bucket it was
  submitted in. A person's reviews on one pull request on one day count once,
  so a burst of replies to comments is one review. Pending reviews, reviews by
  the pull request's author, and bots are left out.

### Releases

The repository's GitHub releases published in the period, read from the
releases themselves and nothing else: a published release is all this
section claims, not a deploy.

The newest minor release is drawn in full, and the other minors in the period
sit under it as rows. Clicking a row opens the same detail under it, and
clicking again closes it; several can be open at once. **See more**, at the
bottom, adds the next ten minors from before the oldest one drawn, as rows that
open the same way, until it reaches the oldest release the mirror holds. It
reads the mirror only, so it makes no request to GitHub. A release in full
says:

- **How many pull requests it lists.** A release says what it holds only in
  its notes, so the pull requests are the links there. Notes with a
  "## Merged Pull Requests" heading are read from it down, since the prose
  above it links some of the same ones again; notes without it are read whole.
  A listed pull request the mirror does not hold, such as one older than its
  two years, is counted apart and said under the bar.
- **What kind they are**, from the conventional-commit type on each title:

  | Kind | Title starts with |
  | --- | --- |
  | Features | `feat` |
  | Fixes | `fix`, `bugfix`, `hotfix`, `revert` |
  | Refactors | `refactor`, `perf` |
  | Chores | `chore`, `docs`, `test`, `ci`, `build`, `style`, `lint` |
  | Dependencies | anything a bot opened, whatever its title |
  | No type | anything else |

  Bot pull requests get their own kind because on a real repository they are
  nearly a third of everything released, which would bury the chores.
- **Which patches followed it.** A tag such as `v1.4.2` is a patch on
  `v1.4.0`, and is listed with it even when published after the period ends,
  with the first item in its notes to say what it did. The notes rather than
  the titles of the pull requests it links, because a patch that reverts links
  the very pull requests it backs out.
- **Who**: for each person, the listed pull requests they opened and the ones
  they reviewed, each as a count and as a share of the release's whole. A
  person's reviews on one pull request count once. Pull requests a bot opened
  are left out of the shares and counted on a line of their own.

A tag that is not a version stands as a minor of its own.

### A person's page

Clicking a name, on a chart or in a folded row, opens that person's page, at
`contributor-dashboard/person/<login>`, and the browser's back button returns
to the dashboard. It shows:

- **Reviews**, their two lines from the dashboard drawn full width.
- **Waiting on their review**: open pull requests whose latest review request
  naming them has not been withdrawn and which they have not reviewed since,
  longest wait first. Only requests that name the person: a request made of a
  team is waiting on the team, with no one to attribute it to until someone
  reviews.
- **Their pull requests**: the ones they opened that were touched in the
  period, newest first, each with the time to its first review, how many
  follow-up reviews it needed, and the time to merge or how long it has been
  open. Twenty-five to a page, since an active author can have a few hundred
  in a year; the server sends one page at a time.

Each row in both lists carries the actions **A row in a list** describes, and
the first of them names the assignee as well.

Times there are business days from when the pull request became ready for
review, which is when it left draft, or when it opened if it never was one.
Weekends do not count; a span under a day reads in hours, and under an hour in
minutes.

## Settings

```sh
bb plugin config contributor-dashboard set repository owner/name
bb plugin reload contributor-dashboard
```

| Setting | Default | What it does |
| --- | --- | --- |
| `repository` | none | The repository to chart, as `owner/name`. |
| `ghPath` | `gh` | The `gh` CLI the sync runs. It must be signed in to an account that can read the repository. |

Settings are read when the plugin loads, so reload it after changing one.

## Syncing with GitHub

The plugin keeps a mirror of the repository's releases, its pull requests, their reviews,
their review-request and ready-for-review events, and whoever each is assigned
to, and of its issues with the events that milestone, add to a project, and
assign them, in its own SQLite database. The assignees are one more field on a
query the sync already makes, so they cost no extra call and no extra rate
limit, but a row mirrored before the field was asked for only gains it the
next time that row changes on GitHub. The page reads only the mirror, so opening it or switching periods
makes no request to GitHub.

The sync runs when the page opens and the mirror is more than 30 minutes old,
and when you press **Refresh** in the title bar. Each run is GraphQL calls through `gh api
graphql`:

Pull requests and issues sync in two passes, each keeping its own high-water
mark and backfill cursor, so finishing one does not affect the other.

- **Each later sync** pages through pull requests most recently updated first,
  50 per call, and stops at the first one the last sync already saw, then does
  the same for issues. Any review
  or review request bumps a pull request's update time, so this picks up every
  change. A sync after a quiet half hour is usually three calls: one each for
  pull requests, issues, and releases.
- **The first sync** reaches back two years, so a year can be compared with the
  year before. That is one call per 50 pull requests updated in those two
  years: about 100 calls, and about five minutes, for a repository with 5,000,
  and another call per 50 issues, which on a repository with 1,700 issues is
  about 36 calls and a little over a minute.
  It saves its place after every call and resumes there if it is interrupted,
  and the page fills in as it goes.
- A pull request with more than 100 reviews or events costs one more call per
  extra 100.
- **Releases** have no update order to page by, and a repository publishes a
  few a week at most, so every sync reads the newest 100 again in one call.
  The first sync reads on back two years, one more call per 100. A release
  edited after a hundred newer ones were published keeps its older notes.

Each call of 50 pull requests or issues, or of 100 releases, costs one point of GitHub's GraphQL rate limit of 5,000 an
hour.

The tables follow GitHub's own objects: `pull_requests`,
`pull_request_reviews`, `pull_request_timeline_items`, `issues`,
`issue_timeline_items`, and `releases`, keyed by GitHub's node id. Each row holds the object as GitHub returned it, with GitHub's field
names, plus the few fields queries filter on as columns. The counts above are
computed when the page reads, never stored, so a change to how one is defined
needs no new sync.

## Related plugins

- **GitHub** (`github`), bundled with bb, browses a repository's issues and
  pull requests. It lists what is open now; Contributor Dashboard charts
  review activity over time.
- **Review Sweep** (`review-sweep`), in this repository, lists the pull
  requests waiting on your review. Contributor Dashboard counts everyone's
  reviews rather than queueing yours.

## Layout

| Path | What it holds |
| --- | --- |
| `mirror/github.ts` | GitHub's objects as the plugin reads them, and the GraphQL queries |
| `mirror/sync.ts` | The sync: one pass per object type, each catching up to its high-water mark and backfilling two years, and fetching past 100 reviews or events |
| `mirror/gh.ts` | The only module that reaches GitHub, through `gh api graphql` |
| `mirror/store.ts` | The only module that touches SQLite: the GitHub-shaped tables and each repository's sync progress |
| `review/flow.ts` | The pure count of where everything opened in the period went, by path, for the overview's lines |
| `review/releases.ts` | The pure read of each release: the pull requests its notes list, their kinds, who merged and reviewed them, and its patches |
| `review/stages.ts` | The pure stage model: each stage's spans over pull requests or issues, its percentiles, and the bands its page draws |
| `review/people.ts` | The pure count of reviews requested and given per person per bucket |
| `review/person.ts` | The pure read of one person's page: what is waiting on their review, and how their own pull requests fared |
| `review/authors.ts` | The pure count of pull requests each person opened and merged, per bucket |
| `review/velocity.ts` | What the two velocity sections share: a person's two lines, and the rule for which of them keep a chart |
| `review/reviews.ts` | Which reviews count, and how a reviewer's replies in one day collapse into one round |
| `review/business-time.ts` | Elapsed time with weekends left out |
| `dashboard/period.ts` | The presets, the range each resolves to, and the days, weeks or months it is drawn in |
| `dashboard/paging.ts` | Where one page of a long list starts and ends |
| `dashboard/contract.ts` | The RPC contract and the realtime channel |
| `components/dashboard-view.tsx` | The page and its shared header, drawn from props alone |
| `components/flow-diagram.tsx` | The overview: the flow diagram across the six stages |
| `components/releases-section.tsx` | The Releases section: one release in full and the rest as rows |
| `components/stage-flow.tsx` | A section's rows of steps, with their times and trends |
| `components/stage-view.tsx` | A stage's page: its two charts, what is in it now, and each day, week or month |
| `components/velocity-section.tsx` | A section of small multiples: the cards, the folded tail, and Show all |
| `components/person-view.tsx` | A person's page, drawn from props alone |
| `components/person-chart.tsx` | One person's small chart, its peak, its hover, and the legend |
| `components/item-row.tsx` | One row of a list: the assignee, the facts, and the two actions |
| `components/start-thread-dialog.tsx` | bb's composer in a dialog, seeded with the row |
| `components/period-picker.tsx` | The presets and the date range, which every page shares |
| `dashboard/remember.ts` | The chosen span, kept across opens |
| `server.ts` | Settings, starting syncs, and the RPCs |
| `app.tsx` | Loads the page's data and re-reads it as the sync stores pages |
| `velocity-section.stories.tsx` | A section with its tail folded, with Show all pressed, and with nobody in the period |
| `contributor-dashboard.stories.tsx` | Six weeks, a hovered week, three months, two weeks drawn by day, a custom range, the first sync, no repository set, a failed sync, a person's page busy, paged, and quiet, and a stage's page busy and clear |

## Working on it

```sh
npm install
npm run harvest:sync   # installs component-library as a copy, not a link
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload contributor-dashboard
```

`npm run storybook` at the root of this repository renders the page with
invented data.

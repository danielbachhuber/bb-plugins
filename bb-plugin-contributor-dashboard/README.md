# bb-plugin-contributor-dashboard

A dashboard of how people contribute to one GitHub repository. A Contributor
Dashboard page in the sidebar draws its sections from a local copy of the
repository's pull requests, reviews, and issues.

## The page

The top of the page names the repository, says when it last synced, and has
the period picker, which every section follows: 6 weeks (the default), 12
weeks, 6 months, and 1 year. The weeks start on Monday; 6 months and a year are
drawn by month.

### Identify → Define → Execute → Verify → Release

The flow at the top is one row per stage, named for the node in the delivery
model it comes from, each saying in a line what its clock measures:

| Stage | Reads | From | To |
| --- | --- | --- | --- |
| Triage | issues | opened | it reaches a milestone or project |
| Assign ownership | issues | in a milestone or project | someone is assigned |
| Implement change | pull requests | opened as a draft | marked ready for review |
| Prepare pull request | pull requests | ready for review | a reviewer is asked |
| Code review | pull requests | a reviewer asked | they leave a review |
| Merge decision | pull requests | approved | merged |

Within each object type the stages divide one timeline, so a pull request is in
at most one pull request stage at a time, and an issue in at most one issue
stage.

The two groups are drawn separately because they work on different time scales:
issue stages run in weeks and pull request stages often in minutes, so one
shared scale would flatten every pull request row into its first pixel. Each
group's scale is named beside its heading, and a bar in one group cannot be
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
right is the median week by week, green where it is falling and red where it is
rising.

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
stage, longest wait first, twenty-five to a page, each linking to GitHub. Under
that, **each week**: bars for how many left the stage that week, with that
week's median and p90 drawn over them, so a slow week can be read against a
busy one.

The queue is what is in the stage now, whatever the period, since a pull
request waiting three months is waiting today.

### Review velocity

**Reviews per person** is one small chart per person, in alphabetical order,
with two lines: reviews **requested** of them and reviews they **gave**, and
both totals for the period beneath their name. Neither total is a share of the
other: a person can review a pull request nobody asked them to, so the reviews
someone gives often outnumber the ones asked of them. Every chart shares one
scale, so a busy reviewer's lines sit higher than a quiet one's. Hovering a
week shows its counts.

What counts:

- **Requested:** each review request naming the person, counted in the week it
  was made. A re-request counts again, because it asks for another review. A
  request made of a team counts for the first person who reviews after it,
  unless they were also asked directly in the meantime or the team request was
  withdrawn first. A team request nobody picked up counts for no one.
- **Given:** each review the person submitted, counted in the week it was
  submitted. A person's reviews on one pull request on one day count once, so
  a burst of replies to comments is one review. Pending reviews, reviews by
  the pull request's author, and bots are left out.

### A person's page

Clicking a name on a chart opens that person's page, at
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

The plugin keeps a mirror of the repository's pull requests, their reviews, and
their review-request and ready-for-review events, and of its issues and the
events that milestone, add to a project, and assign them, in its own SQLite
database. The page reads only the mirror, so opening it or switching periods
makes no request to GitHub.

The sync runs when the page opens and the mirror is more than 30 minutes old,
and when you press **Sync**. Each run is GraphQL calls through `gh api
graphql`:

Pull requests and issues sync in two passes, each keeping its own high-water
mark and backfill cursor, so finishing one does not affect the other.

- **Each later sync** pages through pull requests most recently updated first,
  50 per call, and stops at the first one the last sync already saw, then does
  the same for issues. Any review
  or review request bumps a pull request's update time, so this picks up every
  change. A sync after a quiet half hour is usually one call.
- **The first sync** reaches back two years, so a year can be compared with the
  year before. That is one call per 50 pull requests updated in those two
  years: about 100 calls, and about five minutes, for a repository with 5,000,
  and another call per 50 issues, which on a repository with 1,700 issues is
  about 36 calls and a little over a minute.
  It saves its place after every call and resumes there if it is interrupted,
  and the page fills in as it goes.
- A pull request with more than 100 reviews or events costs one more call per
  extra 100.

Each call of 50 costs one point of GitHub's GraphQL rate limit of 5,000 an
hour.

The tables follow GitHub's own objects: `pull_requests`,
`pull_request_reviews`, `pull_request_timeline_items`, `issues`, and
`issue_timeline_items`, keyed by GitHub's node id. Each row holds the object as GitHub returned it, with GitHub's field
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
| `review/stages.ts` | The pure stage model: each stage's spans over pull requests or issues, its percentiles, and the bands its page draws |
| `review/people.ts` | The pure count of reviews requested and given per person per week or month |
| `review/person.ts` | The pure read of one person's page: what is waiting on their review, and how their own pull requests fared |
| `review/reviews.ts` | Which reviews count, and how a reviewer's replies in one day collapse into one round |
| `review/business-time.ts` | Elapsed time with weekends left out |
| `dashboard/period.ts` | The periods, and the weeks or months each is drawn in |
| `dashboard/paging.ts` | Where one page of a long list starts and ends |
| `dashboard/contract.ts` | The RPC contract and the realtime channel |
| `components/dashboard-view.tsx` | The page and its shared header, drawn from props alone |
| `components/stage-flow.tsx` | The Execute → Verify → Release flow at the top of the page |
| `components/stage-view.tsx` | A stage's page: its two charts, what is in it now, and each week |
| `components/review-velocity-section.tsx` | The Review velocity section |
| `components/person-view.tsx` | A person's page, drawn from props alone |
| `components/person-chart.tsx` | One person's small chart, its hover, and the legend |
| `components/segmented.tsx` | The period picker |
| `server.ts` | Settings, starting syncs, and the RPCs |
| `app.tsx` | Loads the page's data and re-reads it as the sync stores pages |
| `contributor-dashboard.stories.tsx` | Six weeks, a hovered week, a year, the first sync, no repository set, a failed sync, a person's page busy, paged, and quiet, and a stage's page busy and clear |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload contributor-dashboard
```

`npm run storybook` at the root of this repository renders the page with
invented data.

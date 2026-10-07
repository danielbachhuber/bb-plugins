# bb-plugin-review-velocity

Charts code review for one GitHub repository. A Review Velocity page in the
sidebar shows, for each person, the reviews requested of them and the reviews
they gave, week by week, from a local copy of the repository's pull requests
and reviews.

## The page

One small chart per person, in alphabetical order, with two lines: reviews
**requested** of them and reviews they **gave**. The corner shows the totals
for the period as "given of requested". Every chart shares one scale, so a
busy reviewer's lines sit higher than a quiet one's. Hovering a week shows its
counts.

The period picker offers 6 weeks (the default), 12 weeks, 6 months, and 1
year. The weeks start on Monday; 6 months and a year are drawn by month.

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

## Settings

```sh
bb plugin config review-velocity set repository owner/name
bb plugin reload review-velocity
```

| Setting | Default | What it does |
| --- | --- | --- |
| `repository` | none | The repository to chart, as `owner/name`. |
| `ghPath` | `gh` | The `gh` CLI the sync runs. It must be signed in to an account that can read the repository. |

Settings are read when the plugin loads, so reload it after changing one.

## Syncing with GitHub

The plugin keeps a mirror of the repository's pull requests, their reviews,
and their review-request and ready-for-review events in its own SQLite
database. The page reads only the mirror, so opening it or switching periods
makes no request to GitHub.

The sync runs when the page opens and the mirror is more than 30 minutes old,
and when you press **Sync**. Each run is GraphQL calls through `gh api
graphql`:

- **Each later sync** pages through pull requests most recently updated first,
  50 per call, and stops at the first one the last sync already saw. Any review
  or review request bumps a pull request's update time, so this picks up every
  change. A sync after a quiet half hour is usually one call.
- **The first sync** reaches back two years, so a year can be compared with the
  year before. That is one call per 50 pull requests updated in those two
  years: about 100 calls, and about five minutes, for a repository with 5,000.
  It saves its place after every call and resumes there if it is interrupted,
  and the page fills in as it goes.
- A pull request with more than 100 reviews or events costs one more call per
  extra 100.

Each call of 50 costs one point of GitHub's GraphQL rate limit of 5,000 an
hour.

The tables follow GitHub's own objects: `pull_requests`,
`pull_request_reviews`, and `pull_request_timeline_items`, keyed by GitHub's
node id. Each row holds the object as GitHub returned it, with GitHub's field
names, plus the few fields queries filter on as columns. The counts above are
computed when the page reads, never stored, so a change to how one is defined
needs no new sync.

## Related plugins

- **GitHub** (`github`), bundled with bb, browses a repository's issues and
  pull requests. It lists what is open now; Review Velocity charts review
  activity over time.
- **Review Sweep** (`review-sweep`), in this repository, lists the pull
  requests waiting on your review. Review Velocity counts everyone's reviews
  rather than queueing yours.

## Layout

| Path | What it holds |
| --- | --- |
| `velocity/github.ts` | GitHub's objects as the plugin reads them, and the GraphQL queries |
| `velocity/sync.ts` | The sync: catching up to the last high-water mark, the resumable two-year backfill, and fetching past 100 reviews or events |
| `velocity/gh.ts` | The only module that reaches GitHub, through `gh api graphql` |
| `velocity/store.ts` | The only module that touches SQLite: the GitHub-shaped tables and each repository's sync progress |
| `velocity/people.ts` | The pure count of reviews requested and given per person per week or month |
| `velocity/period.ts` | The periods, and the weeks or months each is drawn in |
| `velocity/contract.ts` | The RPC contract and the realtime channel |
| `components/people-view.tsx` | The page, drawn from props alone |
| `components/person-chart.tsx` | One person's small chart, its hover, and the legend |
| `components/segmented.tsx` | The period picker |
| `server.ts` | Settings, starting syncs, and the RPCs |
| `app.tsx` | Loads the page's data and re-reads it as the sync stores pages |
| `review-velocity.stories.tsx` | Six weeks, a hovered week, a year, the first sync, no repository set, and a failed sync |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload review-velocity
```

`npm run storybook` at the root of this repository renders the page with
invented data.

## What you get

A **Contributor Dashboard** page in the sidebar about how people contribute to
one GitHub repository, over 2 weeks, 6 weeks, 3 months, or any range of dates
you pick. **PR velocity** charts for each person the pull requests they opened
and the ones that merged, and **Review velocity** charts the reviews requested
of them and the reviews they gave. A short span is drawn by day, a medium one
by week, and a long one by month. Clicking a name, or finding one in the
search box at the top, opens that person's page: the pull requests they opened and merged, how each fared in
review, then their reviews requested and given, as bars with a trend line, and the pull requests waiting on their review.
Reviews requested of a team, as a CODEOWNERS file asks for them, show where
nobody has picked them up: on the overview's Code review step, in a row per
team under Review velocity with who on it picks up its reviews, and on a
person's page as the pull requests waiting on their teams.
Clicking the **Issues** or **Pull requests** heading lists every one open now,
whatever the span, to sort and filter by author, assignee, draft, or quiet
for 30 days. **Batch** ticks rows from everything the filters match and copies
their links, opens them, or starts one main thread with a subthread for each.
A person's lists and a stage's queue have the same toolbar and Batch, with the
sorts and filters each list's rows support.

## How it works

The plugin keeps a copy of the repository's pull requests and reviews in its
own database, synced through the `gh` CLI when the page opens and the copy is
more than 30 minutes old, or when you press Sync. The first sync reaches back
two years; later ones fetch only what changed. The page reads only the local
copy.

Set the repository with
`bb plugin config contributor-dashboard set repository owner/name`, then
reload the plugin. `gh` must be signed in to an account that can read it.

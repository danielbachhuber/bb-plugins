## What you get

A **Contributor Dashboard** page in the sidebar about how people contribute to
one GitHub repository, over 2 weeks, 6 weeks, 3 months, or any range of dates
you pick. **PR velocity** charts for each person the pull requests they opened
and the ones that merged, and **Review velocity** charts the reviews requested
of them and the reviews they gave. A short span is drawn by day, a medium one
by week, and a long one by month. Clicking a name opens that
person's page: their review lines, the pull requests waiting on their review,
and how their own pull requests fared in review.

## How it works

The plugin keeps a copy of the repository's pull requests and reviews in its
own database, synced through the `gh` CLI when the page opens and the copy is
more than 30 minutes old, or when you press Sync. The first sync reaches back
two years; later ones fetch only what changed. The page reads only the local
copy.

Set the repository with
`bb plugin config contributor-dashboard set repository owner/name`, then
reload the plugin. `gh` must be signed in to an account that can read it.
